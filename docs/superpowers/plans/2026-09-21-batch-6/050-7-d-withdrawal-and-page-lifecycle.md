# 050.7d The withdrawal design, and why the page-lifecycle trigger is not in this packet

|                     |                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item           | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **fourth packet**                                                                                                                                                                               |
| Size class          | S                                                                                                                                                                                                                                                                                          |
| Predecessor         | [050.7c](050-7-c-application-context.md), merged: the application services context, the bootstrap wiring, task 4's two required outcomes handed here without a mandated mechanism.                                                                                                         |
| Design              | This packet's own section 4 (the withdrawal design) and an appended section of [The frontend lifetime slot: states, events, invariants](050-7-lifetime-slot-design.md), reproduced whole in section 7.1 — **no state, event or invariant in that record changes**; section 4 explains why. |
| Reviewed source map | [050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md): tests 3 and 4, owed to the packet that follows this one (section 11).                                                                                                                                 |
| Execution contract  | [batch 1 README](../2026-09-19-batch-1/README.md): "Execution contract", "Rules for every executor", "Standard blocks every packet uses", "Hidden constraints every frontend packet"                                                                                                       |
| Planning head       | `ff751c936881eaff93b05cb7f6ee77665352edea` (`origin/batch-6/integration`, packet c merged)                                                                                                                                                                                                 |

## 1. Goal and non-goals

**Goal.** Close OpenSpec task 4's two required outcomes, left open by packet c's own residual table
and by `tasks.md`'s own "Follow-up for 050-7-d" note under task 4:

1. **Reads and writes through a withdrawn runtime's facade refuse once withdrawal has been
   accepted** — not only once disposal finishes giving the store back.
2. **A validator that retires the runtime from inside its own `isValid` must not still have its
   return value trusted — on EITHER branch it answers**, acceptance or refusal: a refusal is not
   exempt, because `readAndDrop`'s own drop of a refused key must never run against a store a
   re-entrant validator has just withdrawn (section 3.2). The same hazard exists on the write side
   through `JSON.stringify`'s own `toJSON` (section 3.2, Important 1).

Both are stated as required **outcomes**; neither task 4's text nor this packet mandates a
mechanism. Section 4 records the mechanism chosen, why the two mechanisms packet c tried and
withdrew do not apply here unmodified, and exactly what this mechanism guarantees and what stays a
named limit.

**Non-goal, stated once and precisely: this packet does NOT implement the page-lifecycle trigger**
(`pagehide`, hot-module-replacement disposal, `pageshow` restoration — OpenSpec task 5, map tests 3
and 4). The brief that commissioned this packet asked for it in two parts, ordered so the withdrawal
design lands before the trigger that would be the first production path through the window it
closes, and explicitly licensed cutting the second part to a following packet if the two together
would not fit in six slices. **This packet is three slices** (section 6). Part 2 — the trigger —
needs at minimum: extending `application-bootstrap.tsx`'s own model test with the new event ordering
(map test 2's "shutdown is shared across page hide and HMR" and map test 3's "persisted page
restoration joins retirement before rebuilding," including its own rejection/budget-expiry variants
that render the sanitized fatal state), the production wiring of `pagehide`/`pageshow`/HMR-dispose
event handlers behind an injectable event-target dependency (never a global, per the brief), example
tests for each event against the production bootstrap, and one planner-run Chromium case driving a
real `pagehide`/`pageshow`. That is a distinct four-slice piece of work sharing nothing code-level
with this packet beyond `application-bootstrap.tsx` itself, and three plus four is seven — past the
six-slice ceiling the brief sets. **Part 1 (this packet) is never cut; Part 2 is cut to 050-7-e**,
named and scoped in section 11.

**Other non-goals, each a measured finding:**

- **No change to `lifetime-slot.ts`, its model test's own state, event or invariant tables.** Section
  3.1 and section 4 both establish, by reading `lifetime-slot.ts`'s own source rather than by trying
  a third variant of either withdrawn mechanism, that the slot's existing public contract already
  carries everything the fix needs. `lifetime-slot.model.test.ts` — the **test** file, not the
  ownership rule it checks — is extended (section 7.6): one existing production-graph builder is
  wired to the new predicate, the command loop is corrected so it can actually reach a live runtime
  before retiring or replacing it, and two new invariant checks are added over the same generated
  commands, generators and seed the file already used.
- **No new user-visible behaviour.** A read or write that used to succeed inside the narrow
  withdrawal-to-disposal window now throws instead; nothing renders differently, because the only
  callers of `preferences.resource.ts` that can reach this window at all are a captured `Remembered`
  reference, a re-entrant validator, or a re-entrant `toJSON` (section 3.2), and all three are
  internal, not reader-visible.
- **No change to the five delivery call sites, `modules/preferences/composition.ts`, or OpenSpec
  task 12's K2 debt disposition.** Packet c's own section 3.3 and section 11 items 2-3 own that;
  nothing in this packet's own reading changes their scope.
- **No server-side logout, and no session or project runtime.** Unchanged from packet c's own
  non-goals; out of scope for either part of this packet.

## 2. Read first

1. [050.7c](050-7-c-application-context.md) sections 3.2, 4, 11, 13, and its own **"Disposition of
   review 3"** and **"Disposition of review 4"** sections — the two required outcomes, and the two
   failed attempts recorded in this packet's own repository, in packet c's own committed words:
   - **A consumer-side access-time guard**, withdrawn after three review rounds. Packet c's own
     section 3.2 records the exact rehearsed observation against the finished guard:
     `read: "light" slot status: retiring` and `readAndDrop returned null; storage.forget ran while
slot = retiring` — a liveness check performed **before** delegating to the guarded operation
     cannot see a validator that withdraws the runtime **during** the call it is guarding.
   - **A `withdraw` callback invoked synchronously inside `lifetime-slot.ts`'s own `accept()`**,
     withdrawn after packet c's "Disposition of review 4" recorded it broke ownership on two
     independent grounds: a re-entrant callback that itself requested a newer replacement leaked a
     runtime (built, never closed, never live); a throwing callback left the slot published `live`
     with **zero** close attempts. Both trace to the same cause: the callback ran **before**
     `accept()`'s own bookkeeping (detach `held`, publish, fix the ordinal) had committed, so foreign
     code was on the stack while the slot's own invariants were still being established.

   Neither finding says a context- or resource-side mechanism can never close the gap — only that
   these two specific shapes do not.

2. `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`, whole, current tree, **read-only, and unmodified
   by this packet**: `publish()` (lines 250-260) — `state = next` is synchronous, only the
   subscriber notification is deferred — `accept()` (lines 383-393), which calls
   `publish({ status: 'retiring' })` as part of its own synchronous bookkeeping, and
   `disposeWithdrawn()` (lines 294-304), whose own synchronous prefix (capture `withdrawn`, null it,
   call `disposing.close(...)`) runs in the same synchronous flush as `accept()` whenever no other
   transition is already queued. Section 3.1's own rehearsal is built directly from these three.
3. `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`'s `storeOver`, `json`, `text`
   and `unchecked` — where a caller-supplied validator is invoked synchronously, where `JSON.stringify`
   runs before `storage.write`, and where an accepted **or refused** value is returned/acted on
   without any further storage access (lines 60-71, 76-87 and 73 on the `ff751c93` tree).
4. `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts`'s `revocableStorage` and
   `module.ts`'s registration of its disposer — **read for context, not modified**: this is where
   the store is actually revoked today, at disposal.
5. `apps/wbs/fe-01/src/runtime/application-runtime.ts`, whole — `installApplicationRuntime`,
   `ApplicationDependencies`, `applicationSlot`, `acquireApplicationRuntime`. This packet's own
   slice 2 modifies it (section 7.3 has the exact diff).
6. `apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts`, whole — the generated-command property
   this packet's own slice 2 extends (section 7.6), including its `buildInstalled` closure (already
   wiring the production installer into the generated interleavings before this packet), its own
   command loop, and its `Ownership` invariant-checking class.
7. `docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md`, whole — the states,
   events and invariants this packet's design must not contradict.
8. `openspec/changes/adopt-frontend-lifetimes/tasks.md` task 4's exact "Follow-up for 050-7-d"
   wording, and `verify.md`'s "Residual limits handed to 050-7-d" table (packet c's own slice 3
   section).

## 3. Verified facts

Every claim was read or run in this packet's own worktree off `ff751c936881eaff93b05cb7f6ee77665352edea`.
Every command below is run from the repository root and names its own working directory. This
checkout has no `vitest` on `PATH` (`command -v vitest` fails); every Vitest invocation below is
`(cd apps/wbs/fe-01 && bunx vitest run …)`.

### 3.1 `publish()` is synchronous; disposal itself starts synchronously too, when nothing is queued ahead of it

`lifetime-slot.ts:250-260`:

```ts
const publish = (next: LifetimeState<S>): void => {
  state = next;
  if (notifying) return;
  notifying = true;
  void Promise.resolve().then(() => {
    notifying = false;
    for (const listener of [...listeners]) listener();
  });
};
```

`state = next` is the **first** line — a plain synchronous assignment. `accept()`
(`lifetime-slot.ts:383-393`) calls `publish({ status: 'retiring' })` as the third step of its own
synchronous bookkeeping (`newest += 1`; detach `held`; publish), **before returning `newest` to
`replace`'s or `retire`'s own caller**, which is itself synchronous up to that call's own first
`await`. Consequently: **`slot.snapshot()` already answers `retiring` the instant a request is
accepted, including from code that is, right now, on the same synchronous call stack that triggered
that `accept()` call** — a re-entrant validator's own call to `slot.retire()` is exactly such a call.

A **second**, independently useful fact: `disposeWithdrawn()` (`lifetime-slot.ts:294-304`) also
begins running synchronously, immediately, when `transition()` reaches it with nothing already
queued ahead (`ahead === null`, the common single-in-flight-transition case) — its own body captures
`withdrawn`, nulls it, and calls `disposing.close({ timeoutMs: budgetMs })` before its own first
`await`. Rehearsed directly: a boolean `closeStarted` flag flipped as the very first statement of a
fake runtime's own `close()` reads `true` immediately after `slot.retire()` is called, when no other
transition is in flight. `ensureLive` (section 4.2) does **not** depend on this fact — it only ever
consults `slot.snapshot().status`, which is correct from `accept()`'s own synchronous bookkeeping
regardless of the disposal queue's own state — but the fact is recorded because it corrects an
earlier, overstated claim ("before disposal ever runs") that appeared in test titles and prose in an
earlier draft of this packet (review 2, Important 6) and is removed throughout this revision.

### 3.2 The re-entrant validator, and the re-entrant `toJSON`: the read already happened; the refusal branch is not exempt; serialization is not exempt either

`preferences.resource.ts`'s `json` claim thunk (`ff751c93` tree, lines 66-71):

```ts
() => {
  const stored = storage.read(key);
  if (stored === null) return { status: 'absent' };
  const claimed = parsedOrNothing(stored);
  return isValid(claimed) ? { status: 'held', value: claimed } : { status: 'refused' };
},
```

`storage.read(key)` and `parsedOrNothing` both run **before** `isValid` is ever called; by the time a
re-entrant `isValid` calls `slot.retire()`, the raw string has already been read successfully. This is
why moving `revocableStorage`'s `revoke()` earlier in the **async** disposal pipeline cannot help: the
synchronous call stack that contains the re-entrant `isValid` call runs to completion before any
`await`-gated continuation gets a turn. Only a check against something already committed
**synchronously** — `slot.snapshot()`, per 3.1 — can close this.

**The refusal branch is not a safe exemption.** A validator that withdraws the runtime and then
answers `false` still reaches `{ status: 'refused' }` on the unmodified tree, and `readAndDrop`'s own
`if (claimed.status === 'refused') storage.forget(key)` then deletes a key from a store this runtime
no longer owns. Rehearsed directly against the unmodified tree, using the exact re-entrant shape:

```text
validator calls slot.retire(), then returns false
readAndDrop returned null
storage.forget observed slot status: retiring
stored bytes: {}
```

**Neither is the write side exempt (review 2, Important 1).** `json`'s own write callback
(`ff751c93` tree, line 73) is `storage.write(key, JSON.stringify(value))`. `JSON.stringify` runs
**arbitrary caller-owned code** — `value`'s own `toJSON()` method, or a getter reached while walking
it — before `storage.write` is ever called. Rehearsed directly against the unmodified tree, with a
value whose `toJSON()` calls `slot.retire()` and returns normally:

```text
toJSON slot retiring
write returned; bytes { test: "{\"value\":1}" } status retiring
```

A single pre-check (before `JSON.stringify`) cannot see this either, for the same reason the
validator's refusal branch cannot: the hazardous call happens **after** the one guard already ran.

### 3.3 Tiers and the sandbox

- `preferences.resource.ts`, `preferences.resource.test.ts`, `contract.ts`, `module.ts`,
  `module.test.ts`, `application-runtime.ts`, `application-runtime.test.ts` and
  `lifetime-slot.model.test.ts` need no `jsdom`; `application-runtime.test.ts` and
  `lifetime-slot.model.test.ts` are already listed in `vitest.node-suites.ts` — the node tier.
  `application-runtime.test.ts`'s new production-singleton example (section 7.4) is deliberately
  written so it never needs the DOM either: `ensureLive()` refuses **before** any operation ever
  reaches the real browser-store adapter. Rehearsed through the exact node-tier command:
  `(cd apps/wbs/fe-01 && NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx
vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude
src/components/wbs/short-date.test.ts)`.
- No literal DOM-global word (`localStorage`, `document`, `window`, `jsdom`, and the rest of
  `src/test-tiers.test.ts`'s own `DOM_EVIDENCE` pattern) appears in any new or changed test file's
  source text, prose included — `\bwindow\b` matches an ordinary English "window" too, not only a
  literal global, which this packet's own earlier draft tripped on twice before this revision.
  Rehearsed: `(cd apps/wbs/fe-01 && NX_DAEMON=false bunx vitest run --config vitest.node.config.ts
--exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
src/test-tiers.test.ts)` passes only once this wording is avoided (section 3.5).
- `bun test <dir>` is a filter, not a path (batch-6 addendum 14); this packet prescribes no
  `bun test`.
- `grep` on this workstation is ugrep, which exits 1 on a missing file as well as on no match
  (addendum 19); every grep-based check below is gated with `test -f`/`[ -s … ]` first.
- The known `claims.db.test.ts` contention race is not this packet's; if a whole-suite run shows it,
  record and rerun once per the addendum's own exception.

### 3.4 What review 2 found, and what changed because of it

Review 2's own per-finding disposition is section 14. The two structural ones:

- **Critical 2 (the core of this packet): the pinned property never retired a live runtime.** The
  command loop only yielded for a `settle` command when `scheduler.count() > 0`; since `Acquire<S>`
  is synchronous and only _disposal_ ever touches the scheduler, the very first `replace` on an empty
  slot had nothing scheduled yet, so `settle` was a no-op and the whole generated sequence ran in one
  synchronous burst with no runtime ever reaching `live` before something superseded it. Fixed by
  adding a plain microtask flush (`await Promise.resolve()`) when `scheduler.count() === 0`; a
  `liveRetirements` counter, accumulated across the whole 300-run pinned property and asserted
  `> 0` once after `fc.assert` returns, is what makes this checkable rather than assumed — rehearsed
  fresh at **14** (section 8.3). A second, related bug: `storesFollowTheirGraphs` compared
  `probeRevoked() === graphClosed` unconditionally, but `probeRevoked` only recognizes the `REVOKED`
  message, and `WITHDRAWN` (this packet's own new message) now fires _first_ for any runtime while
  nothing is currently live — masking `REVOKED` entirely for a retired-to-`empty` runtime. Fixed by
  scoping `storesFollowTheirGraphs` to `live !== null` (section 4.4's own precedence explains why)
  and adding a second, unconditional invariant, `neverSilentlyReadsPastLive`, for the case that check
  excludes.
- **Critical 1: the required mutation (§8.3) did not typecheck.** An earlier draft's §8.3 prescribed
  removing `createPreferences`'s second parameter entirely, which leaves every two-argument caller
  failing to compile with `Expected 1 arguments, but got 2` — fourteen distinct diagnostic locations,
  rehearsed fresh in this response: `module.ts:67` plus thirteen call sites in
  `preferences.resource.test.ts` (`tsc --build --force`'s own project-reference structure recompiles
  `module.ts` under more than one tsconfig, so the raw log repeats that one location three times —
  sixteen lines for fourteen distinct sites). The mutation that belongs in the inventory instead keeps
  the full two-argument signature and disables only the enforcement:
  `const ensureLive = (): void => { void isLive(); };` — rehearsed to typecheck (section 8.1) and to
  fail the correct, named tests (section 8.2).

The rest — Important 1 (`toJSON`, section 3.2), Important 4 (a recording adapter proving zero reads,
section 7.2), Important 2/3/5/6 and Minor 1-2 (a complete, consistent mutation inventory; fresh
baselines; the precedence rewording; the corrected map-test citation; the `(cd apps/wbs/fe-01 && …)`
wrapper; corrected example counts) — are addressed throughout and summarized in section 14.

### 3.5 Numbers, rehearsed fresh in this response

Counts are relative, never absolute (batch-1 README; batch-3 brief). Every figure below was read
from an actual run in this packet's own worktree, not computed by hand — the exact defect review 2's
own Important 3 found in an earlier draft.

| File                                                     | Before (`ff751c93`)                                                                                                                                        | After                | Delta                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| `preferences.resource.test.ts`                           | 10 tests                                                                                                                                                   | 22 tests             | **+12** (6 pre-check + 1 toJSON + 4 post-check examples + 1 property)                          |
| `module.test.ts`                                         | 8 tests                                                                                                                                                    | 8 tests              | **+0** (fixture-only edit)                                                                     |
| `application-runtime.test.ts`                            | 9 tests                                                                                                                                                    | 14 tests             | **+5**                                                                                         |
| `lifetime-slot.model.test.ts`                            | 1 test                                                                                                                                                     | 2 tests              | **+1** (the pinned property, extended, plus one new deterministic example)                     |
| Owned path (`src/runtime/` + `src/modules/preferences/`) | 13 files / 81 tests                                                                                                                                        | 13 files / 99 tests  | **+0 files / 18 more tests**                                                                   |
| Node config (`vitest.node.config.ts` …)                  | 46 files / six hundred fifty-six tests                                                                                                                     | 46 files / 674 tests | **+0 files / 18 more tests** (the same eighteen, since none of the touched files need `jsdom`) |
| `wbs-fe-01:test:unit` (planner)                          | 48 files / 676 tests (this response's own fresh rehearsal, captured on the unchanged tree before re-applying the packet's changes — not cited to packet c) | 48 files / 694 tests | **+0 files / 18 more tests**                                                                   |
| `tool-devsync:test` (planner, paths staged)              | 366 pass / 0 fail (this packet's own baseline, collected before any change)                                                                                | 366 pass / 0 fail    | **unchanged** — an acceptance criterion                                                        |
| OpenSpec `validate --all --json`                         | 114 / 114 / 0 (this packet's own baseline, collected before any change)                                                                                    | 114 / 114 / 0        | **unchanged** — an acceptance criterion                                                        |

The three-file total — `preferences.resource.test.ts` plus `module.test.ts` plus
`application-runtime.test.ts` — is `22 + 8 + 14 = 44`, not `41` or `45` — both figures an earlier
draft stated at different points; this table is the one this packet stands behind.
`preferences.resource.test.ts` on its own holds `22`. Zero new files are created by this packet: every
touched path already exists on `ff751c93`.

## 4. Design: the withdrawal mechanism, what it guarantees, and what stays a limit

**Decision, stated first: `lifetime-slot.ts` is not modified. The two required outcomes are closed
entirely inside `preferences.resource.ts`, fed a synchronous liveness predicate that
`application-runtime.ts` binds to the existing, unmodified `LifetimeSlot.snapshot()`.**

### 4.1 Why this is not a third attempt at either withdrawn mechanism

- **It is not the access-time guard.** That guard's defect was structural: it checked liveness
  **once, before** delegating, so a validator that withdraws the runtime **during** the delegated
  call passed through unseen. This packet's mechanism (`ensureLive`, section 4.2) checks liveness
  **after `isValid` returns, on both branches, and after `JSON.stringify` runs** — exactly the
  moments the failed guard never reached.
- **It is not the `accept()` callback.** `lifetime-slot.ts` is not touched: `accept()`,
  `transition()` and `disposeWithdrawn()` are byte-for-byte identical to the `ff751c93` tree
  (confirmed by an empty `git diff --stat` against both `lifetime-slot.ts` and
  `lifetime-slot.model.test.ts`'s own **production code paths** at every slice's own hand-over —
  `lifetime-slot.model.test.ts` itself, the test file, is the one path this packet does touch,
  exactly as authorized in section 1 and section 5). The mechanism only ever calls the slot's
  already-public `snapshot()` — the same method `useApplicationServicesState` (050-7-c) already
  calls — never `replace`, `retire`, or any method not already part of `LifetimeSlot<S>`'s existing
  contract. No foreign code runs inside the slot's own bookkeeping.

### 4.2 The mechanism

1. **`contract.ts`** adds `IsRuntimeLive = () => boolean` and extends `PreferencesRequirements` with
   `isLive: IsRuntimeLive` (documentation only — this interface is never referenced by code,
   matching its existing, unenforced status for `browserStore`).
2. **`preferences.resource.ts`**'s `createPreferences` takes an optional second parameter,
   `isLive: IsRuntimeLive = () => true`. A closure `ensureLive` throws a new, distinct message
   (`WITHDRAWN`) when `isLive()` answers `false`. `storeOver`'s shared `write` and `forget` call
   `ensureLive()` before touching storage. `json`'s own write callback calls `JSON.stringify` first,
   **then** `ensureLive()`, then `storage.write` — the re-entrancy this closes is on the serializer,
   not the storage call. `json`'s and `text`'s own claim thunks call `ensureLive()` **three times**:
   once before `storage.read`; once more after `isValid` returns and refuses, **before** returning
   `{ status: 'refused' }`; and once more after `isValid` returns and accepts, before returning
   `{ status: 'held', value }`. `unchecked`'s claim thunk, which has no caller-supplied validator to
   re-enter through, gets one `ensureLive()` before its read.
3. **`module.ts`** registers `isLive` as the preferences module's second host requirement, resolved
   by the same `preferences` factory that already resolves `preferencesStore`, and passes it straight
   through to `createPreferences`. `preferencesStore` is destructured **before** `isLive` in the
   factory's own parameter object, which is what keeps `module.test.ts`'s existing "names itself when
   a host omits the browser store" test's exact message unchanged when a host supplies neither
   (rehearsed directly, section 8.2).
4. **`application-runtime.ts`** extends `ApplicationDependencies` with an **optional**
   `isLive?: IsRuntimeLive`, defaulted to `() => true` inside `installApplicationRuntime` — every
   existing call site keeps compiling and passing unchanged. `acquireApplicationRuntime` — the one
   production wiring — overrides it: `isLive: () => applicationSlot.snapshot().status === 'live'`,
   read from inside this one composition-root closure rather than imported into
   `preferences.resource.ts` or `module.ts`, which is what keeps rule K2's boundary.

### 4.3 What this guarantees, checked four ways

**(a) An ordinary, non-reentrant read or write through a captured `Remembered` reference refuses
from the instant withdrawal is accepted — not only once disposal finishes.** Proved against a real,
non-singleton `createLifetimeSlot()` and `installApplicationRuntime` (section 7.4): calling
`slot.retire()` **without awaiting it**, then immediately `detail.write(true)`, throws `WITHDRAWN`.
Proved a second, independent way against the real production singleton (`acquireApplicationRuntime` +
`applicationSlot`, section 7.4), through the node tier's own real command.

**(b) A validator that retires or replaces its own runtime from inside `isValid` and then answers
EITHER way does not let a value be trusted or a key be deleted. Neither does a re-entrant `toJSON`.**
Proved by hand-written examples covering JSON and bare text, accepting and refusing, each from a
fresh live fixture (section 7.2), by a dedicated `toJSON` example (section 7.2), by a generated
property over every validator combination (section 7.2), and by `lifetime-slot.model.test.ts`'s own
generated commands over a real slot, real retirement, real replacement, re-entrancy from a factory or
a listener, and pending/rejecting/never-settling disposal — now including at least one genuinely
**live** runtime per pinned run (section 7.6, section 4's own review-2 correction above).

**(c) A read genuinely never reaches the underlying store once withdrawn — not merely "throws
afterward."** A `fakeBrowserStorage`'s own `held()` records bytes a _write_ left behind, but has no
way to show a _read_ never happened: a guard moved to run **after** `storage.read` still throws the
right message, so a message-only test cannot tell the two apart. A recording adapter
(`recordingBrowserStorage`, section 7.2) logs every `read` call; the pre-check examples assert
`recordingStore.reads()` stays empty, including for the absent-value case. Each of the three
shapes' own pre-checks (`json`, `text`, `unchecked`) was independently moved past its own
`storage.read` and observed to fail exactly the recording-based test (section 8.1).

**(d) The check survives inside the disposal path itself, not only at the boundaries.**
`lifetime-slot.model.test.ts`'s own extended `close()` (section 7.6) asserts, as the very first thing
a disposal does, that a read through the runtime being disposed already fails — proving `WITHDRAWN`
(or, if disposal happens to have finished, `REVOKED`) fires **before** that disposal's own bounded
close has even been scheduled.

### 4.4 `WITHDRAWN` vs. `REVOKED`: precedence read from the slot's CURRENT state, not from history

`IsRuntimeLive` is scoped to the **slot**, not to one runtime's identity — `() => slot.snapshot()
.status === 'live'` answers "is something live here, right now", not "is it still me". **Precedence
is never "permanent"; it tracks the slot's own current state, moment to moment:**

- **While the slot is not live** (`status !== 'live'`, whether `retiring`, `constructing`, `empty` or
  `fatal`), `ensureLive` refuses `WITHDRAWN` for every reference whose own runtime is not the live
  one — including a runtime that was retired all the way to `empty`, for as long as the slot stays
  that way. Tested directly (section 7.4): even after **fully awaiting** `slot.retire()` — disposal
  complete, the store's own `revoke()` already run — a captured reference still throws `WITHDRAWN`
  while the slot remains non-live.
- **Once a later publication makes the slot live again — with anyone** — `isLive()` answers `true`
  again for every stale reference too, and a stale reference's own read then reaches its own store
  directly, which throws `REVOKED` if that store has already been given back. Tested three ways
  (section 7.4): a direct `replace` while the stale reference was captured from the runtime just
  replaced; the retire-then-**later**-replace sequence review 2 asked to be added explicitly, where
  the _same_ reference is observed to flip from `WITHDRAWN` (while the slot sat `empty`) to `REVOKED`
  (once a separate, later `replace` made the slot live again) without any code of its own changing.

Both are correct, not a defect in either direction: `WITHDRAWN` is what task 4's own wording names
("once withdrawal has been accepted... must refuse"), and `REVOKED` is bounded by the same
store-level guarantee `browser-storage.repository.ts` already provided before this packet.

### 4.5 Why the property in `preferences.resource.test.ts` is not `fc.scheduler()`

A validator's re-entrant call to `retire`/`replace` (and a `toJSON`'s own re-entrant call) is a
single synchronous statement, fully ordered by the call stack that contains it (section 3.1's own
argument) — there is no scheduler to hand control to, because nothing in that specific interaction is
asynchronous. `fc.property` generating which operation, whether the validator withdraws, and what it
answers, is the tool that matches this shape. The genuinely asynchronous, schedulable part of this
packet's own claim — captured handles across real retirement, replacement and disposal that is
pending, rejecting or never settling, **including at least one genuinely live runtime per pinned
run** — is exactly what `lifetime-slot.model.test.ts`'s own `fc.scheduler()`-based property now
generates (section 7.6), and extending that file — fixing its own command loop so it can actually
reach `live` — is smaller and more faithful than building a second, parallel real-slot scheduler
property from scratch, per the brief's own "keep the owner implementation unchanged if possible, but
explicitly authorize the necessary test changes" — authorized here, in this file, for exactly this
reason.

### 4.6 What remains a limit

- **This closes the gap for the preferences resource only.** A future lifetime (session, project)
  that calls a caller-supplied validator synchronously inside its own resource layer needs the same
  check built for it. `IsRuntimeLive` (`contract.ts`) is written generically enough to be reused
  as-is; nothing in this packet forces a future author to reuse it.
- **`IsRuntimeLive` answers for the slot, not for one runtime's identity** — section 4.4's own
  `replace`-case limit, stated and tested rather than glossed over.
- **The production trigger that would create the first real path through this window** — a page
  actually retiring its runtime while the tree stays mounted — does not exist yet; that is Part 2,
  cut to 050-7-e (section 11).

## 5. File plan

| Path                                                                      | Slice   | Create or modify | Note                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md` | 1       | modify           | appends the "Appendix (050-7-d, …)" section only (section 7.1); no other line changes                                                                                            |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                     | 1, 2, 3 | modify           | each slice appends only its own section                                                                                                                                          |
| `apps/wbs/fe-01/src/modules/preferences/contract.ts`                      | 2       | modify           | `IsRuntimeLive`, `PreferencesRequirements.isLive`                                                                                                                                |
| `apps/wbs/fe-01/src/modules/preferences/module.ts`                        | 2       | modify           | `preferences` factory takes `isLive`, passes it to `createPreferences`                                                                                                           |
| `apps/wbs/fe-01/src/modules/preferences/module.test.ts`                   | 2       | modify           | `hostOver` registers `isLive: () => true`                                                                                                                                        |
| `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`          | 2       | modify           | `createPreferences`'s new `isLive` parameter, `ensureLive`, ten call sites                                                                                                       |
| `apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts`     | 2       | modify           | one new `describe` block: 11 examples + 1 generated property (12 tests)                                                                                                          |
| `apps/wbs/fe-01/src/runtime/application-runtime.ts`                       | 2       | modify           | `ApplicationDependencies.isLive`, the bag registration, `acquireApplicationRuntime`                                                                                              |
| `apps/wbs/fe-01/src/runtime/application-runtime.test.ts`                  | 2       | modify           | five new examples: a real non-singleton slot, precedence (both directions, including retire-then-later-replace), the real singleton                                              |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts`                  | 2       | modify           | `buildInstalled` wired to the new predicate; the command loop's own yield fixed; two new invariant methods; one continuous, in-disposal assertion; one new deterministic example |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                      | 3       | modify           | appends one sentence under task 4's existing follow-up note                                                                                                                      |

**Eleven distinct paths** (`verify.md` counted once; touched by all three slices, each appending
only its own section — included in slice 1's own hand-over list). **No path under
`apps/wbs/fe-01/src/runtime/lifetime-slot.ts` (the production file) appears in this table, and none
is touched by this packet** — `lifetime-slot.model.test.ts`, its **test** file, is touched, exactly
as section 4.5 authorizes and section 1 states. Zero new files.

## 6. Slices

Three. Each ends in one planner commit with the exact subject given, and appends **its own**
`verify.md` section in that same commit. Design before code: slice 1 is documentation-only.

**Dispatch.** The launcher is `/home/df/wd/puni/puni-plan/exec/run-executor.sh`:

```sh
run-executor.sh 050-7-d-withdrawal-and-page-lifecycle slice-1 <base> --batch batch-6 --preserve evidence
run-executor.sh 050-7-d-withdrawal-and-page-lifecycle slice-2 <base> --batch batch-6 --preserve evidence --resume
run-executor.sh 050-7-d-withdrawal-and-page-lifecycle slice-3 <base> --batch batch-6 --preserve evidence --resume
```

**`--resume` on slices 2 and 3**, or the launcher exits 67. **No `--network`** and no browser: this
packet needs neither. **Slice 3 references only this packet's own already-committed `verify.md`
sections (slices 1 and 2's own, written by the planner commits that landed them) — it re-derives
nothing and re-runs no earlier slice's mutations, so it needs no `--seed` and cites no other
attempt's evidence** (review 2, Important 5).

**Every independently executed verification block below begins with `set -euo pipefail`.**

### Step 0 — at the start of every slice, from the repository root

```bash
set -euo pipefail
git rev-parse HEAD
git status --short --untracked-files=all > "$TMPDIR/evidence/slice-start-status.txt"
status_file="$TMPDIR/evidence/step0-unit.status"
log_file="$TMPDIR/evidence/step0-unit.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/step0-tsc.status"
log_file="$TMPDIR/evidence/step0-tsc.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/step0-owned.status"
log_file="$TMPDIR/evidence/step0-owned.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/ src/modules/preferences/) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/step0-openspec.status"
report="$TMPDIR/evidence/step0-openspec.json"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json > "$report" 2>&1; then
  echo 0 > "$status_file"
else
  echo "$?" > "$status_file"
fi
test "$(cat "$status_file")" = "0"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

Step 0's own OpenSpec check uses the README's own strict block — the `jq` predicate, not exit status alone
(review 4, Important 1: a loose success check here would pass on a malformed or empty report that a
non-zero exit code alone cannot rule out).

This rehearsal's own baseline, collected fresh at each slice's own step 0 rather than assumed carried
forward (review 2, Important 5; review 3, Critical 2 — no slice's own step 0 claims a baseline it did
not itself observe). Slices 1 and 2 both run step 0 on the **unchanged** tree, so both see the same
figures: node config `six hundred fifty-six passed` / `46 passed (46)` files, exit 0; forced typecheck
exit 0; owned path `81 passed (81)` / `13 passed (13)` files, exit 0; OpenSpec `114`/`114`/`0`, exit 0.
Slice 3's own step 0 runs after slice 2 is committed, so it sees slice 2's own green numbers instead:
node config `674 passed (674)` / `46 passed (46)` files; owned path `99 passed (99)` / `13 passed (13)`
files; OpenSpec unchanged at `114`/`114`/`0`.

**The following block is PLANNER-ONLY, and runs BEFORE slice 1 — the executor does not run it.** It
captures this packet's own fresh baseline for the planner-only targets slice 3 later compares against
(review 3, Important 3: baselines collected before implementation, not cited to an earlier packet).

```bash
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
status_file="$TMPDIR/evidence/baseline-tool-devsync-test.status"
log_file="$TMPDIR/evidence/baseline-tool-devsync-test.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/baseline-build.status"
log_file="$TMPDIR/evidence/baseline-build.log"
if NX_DAEMON=false bunx nx run wbs-fe-01:build > "$log_file" 2>&1; then
  echo 0 > "$status_file"
else
  echo "$?" > "$status_file"
fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/baseline-wbs-fe-01-test-unit.status"
log_file="$TMPDIR/evidence/baseline-wbs-fe-01-test-unit.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:test:unit --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/baseline-wbs-fe-01-test.status"
log_file="$TMPDIR/evidence/baseline-wbs-fe-01-test.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:test --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"

report="$TMPDIR/evidence/baseline-openspec-validation.json"
status_file="$TMPDIR/evidence/baseline-openspec-validation.status"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json > "$report" 2>&1; then
  echo 0 > "$status_file"
else
  echo "$?" > "$status_file"
fi
test "$(cat "$status_file")" = "0"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

Observed in this rehearsal, on the unchanged tree (`ff751c93`), captured before slice 1 starts:
`tool-devsync:test` — `366 pass / 0 fail`. `wbs-fe-01:build` — exit 0. `wbs-fe-01:test:unit` — `48
files / 676 tests`. OpenSpec — exit 0, report `114`/`114`/`0`, the same strict predicate slice 3 runs
again, holding here too. `wbs-fe-01:test` (the whole jsdom-plus-zoned tier: `TZ=UTC` over the default
config, then `TZ=Pacific/Auckland` over `vitest.zoned.config.ts`, both `--no-file-parallelism
--maxWorkers=1`) — **attempted in this rehearsal and did not finish inside this response's own
allowance** (review 4, Important 1, requires this baseline; section 6's own slice-3 block already
records the same target timing out past 6m44s on the finished tree, so this pre-implementation attempt
is **recorded as pending planner verification**, not claimed as captured, rather than treated as a row
this response compared).

### Slice 1 — the withdrawal design record appendix, before any code

**Prerequisite:** none (first slice).

Append the section given whole in section 7.1 to the end of `050-7-lifetime-slot-design.md`, and
append this slice's own section to `verify.md` (section 9 has its content). No test exists for prose.

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice1-diff.status"
git diff --stat apps/wbs/fe-01/src/runtime/lifetime-slot.ts \
  apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts > "$TMPDIR/evidence/slice1-diff.log"
test -f "$TMPDIR/evidence/slice1-diff.log"
if [ -s "$TMPDIR/evidence/slice1-diff.log" ]; then
  echo "unexpected diff"; echo 1 > "$status_file"
else
  echo 0 > "$status_file"
fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice1-prettier-write.status"
log_file="$TMPDIR/evidence/slice1-prettier-write.log"
if GSETTINGS_BACKEND=memory bunx prettier --write \
  docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md \
  openspec/changes/adopt-frontend-lifetimes/verify.md \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice1-prettier-check.status"
log_file="$TMPDIR/evidence/slice1-prettier-check.log"
if GSETTINGS_BACKEND=memory bunx prettier --check \
  docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md \
  openspec/changes/adopt-frontend-lifetimes/verify.md \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

Note the `[ -s file ]` check (not a grep): it never confuses "no diff" with "file missing" (addendum
19), and the preceding `git diff --stat ... > file` always creates the file regardless of outcome.

**Ready to commit:**

```bash
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice1-end-status.txt"
# every line must be one of:
#  M docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md
#  M openspec/changes/adopt-frontend-lifetimes/verify.md
# or already present verbatim in slice-start-status.txt, or this packet's own
# plan document with a leading " M " (a concurrent planner revision).
```

Subject: `docs(plans): record why withdrawal closes from a consumer, not the slot`.

### Slice 2 — the isLive plumbing and the liveness checks, test before implementation

**Prerequisite:** slice 1, committed.

**Step 2a — red, on the unchanged tree, every test and fixture edit first.** Add **all four** of this
slice's test/fixture edits — none of section 7.3's or 7.6's production diffs yet — before touching any
implementation file (review 2, Important 3, restated as review 3's Important 1: an earlier draft's
Step 2a added only `preferences.resource.test.ts`, understating what must be red before anything turns
green):

- `preferences.resource.test.ts` — the whole new `describe('once the runtime that owns this store is
no longer live', …)` block (section 7.2). The new test bodies call `createPreferences(store, isLive)`
  with an extra argument the current signature does not declare; Vitest's `esbuild`-based transform
  does not type-check, so this runs and fails at the assertion, not at a parse error. Compilation
  (`tsc --build --force`) is deferred to step 2b's own green checkpoint, once the two-argument
  signature exists to satisfy it — stated here explicitly rather than left implicit.
- `application-runtime.test.ts` — the five new examples (section 7.3's diff).
- `lifetime-slot.model.test.ts` — the extended property and its new deterministic example (section 7.6).
- `module.test.ts` — the fixture edit that registers `isLive` on `hostOver` (section 7.3's diff); this
  one alone stays green, since nothing in the unchanged production tree yet requires it.

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice2-red.status"
log_file="$TMPDIR/evidence/slice2-red.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run \
    src/modules/preferences/preferences.resource.test.ts \
    src/modules/preferences/module.test.ts \
    src/runtime/application-runtime.test.ts \
    src/runtime/lifetime-slot.model.test.ts) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
```

— status `1`, rehearsed fresh against this exact combined addition on the **unchanged** production
tree, each file's own observed result: `preferences.resource.test.ts` **12 failed \| 10 passed (22)**
(every new example on `AssertionError: expected [Function] to throw an error` /
`- Expected: null` / `+ Received: undefined`; the property fails after 10 runs on seed `20260924`,
shrunk counterexample `["accept","read",true]`); `application-runtime.test.ts` **4 failed \| 10 passed
(14)`; `lifetime-slot.model.test.ts`**2 failed \| 0 passed (2)** (the same shrunk counterexample
section 8.3 reports against a mutant, now against unmodified production code instead);`module.test.ts`
**8 passed (8)**, unaffected — the fixture registers a dependency nothing yet asks for. Combined across
the four files: **18 failed \| 28 passed (46)**.

**Step 2b — implement.** Apply the `preferences.resource.ts` production diff in section 7.2 (Minor 3's
own anchor at line 73), then the `contract.ts`, `module.ts` and `application-runtime.ts` production
diffs in section 7.3. No further test file changes: every test and fixture edit already landed in
step 2a.

**Green:**

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice2-green.status"
log_file="$TMPDIR/evidence/slice2-green.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/ src/modules/preferences/) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-node.status"
log_file="$TMPDIR/evidence/slice2-node.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts \
    --exclude src/components/wbs/short-date.test.ts) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-tsc.status"
log_file="$TMPDIR/evidence/slice2-tsc.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-lint.status"
log_file="$TMPDIR/evidence/slice2-lint.log"
if NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— exit 0 each. Owned: `13 files / 99 tests`, eighteen more than slice 2's own step-0 baseline of `81`.
Node: `46 files / 674 tests`, the same eighteen more than step 0's `six hundred fifty-six` (files
unchanged at both: none of the touched files need `jsdom`). tsc: exit 0. Lint: exit 0 — this
rehearsal hit autofixable findings twice (an import-sort order, a
`jsdoc/no-multi-asterisks` on a markdown-emphasis word placed right after a JSDoc line's own leading
`*`), each `bunx eslint --fix`-then-hand-adjusted; section 7.2's and 7.3's own listings are already
clean.

**Seventeen mutation sites across three production files, rehearsed alone — section 8 has the full
table**: `preferences.resource.ts` (15: ten single-site removals, two broad mutations — the inverted
condition and the Critical-1 enforcement-disabled mutant — and three guard-relocation mutations that
move a pre-check past `storage.read` instead of removing it), `module.ts` (1: the resolution order),
and `application-runtime.ts` (1: the production predicate, observed two ways). **Eighteen proof
entries**, because `preferences.resource.ts`'s own disabled-enforcement site (row 2) is exercised a
second time, against `lifetime-slot.model.test.ts`'s extended property over a real slot (section 8.3)
— not an eighteenth site (review 4, Important 2).

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice2-mutation-tsc.status"
log_file="$TMPDIR/evidence/slice2-mutation-tsc.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— run once per fault in section 8, always exit 0 (every mutant typechecks), restored to the green
tree before the next (`git diff` against the pre-mutation tree empty after each restore).

**Ready to commit:**

```bash
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice2-end-status.txt"
# every line must be one of the nine owned paths in section 5's slice-2 row,
# already present in slice-start-status.txt, or this packet's own plan document.
```

Subject: `feat(wbs-fe-01): refuse preference reads and writes once withdrawal is accepted`.

### Slice 3 — hand-over

**Prerequisite:** slice 2, committed.

Add one sentence under task 4's existing "Follow-up for 050-7-d" note in
`openspec/changes/adopt-frontend-lifetimes/tasks.md` (section 9 has the exact text). Append this
packet's own section to `verify.md` (section 9), which **references slice 1's and slice 2's own
already-committed sections only** — it records no new mutation observation of its own.

**Verify — the README's own strict OpenSpec block:**

```bash
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
report=$(mktemp "$TMPDIR/evidence/openspec-validation.XXXXXX.json")
status_file="$TMPDIR/evidence/openspec-validation.status"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json > "$report" 2>&1; then
  echo 0 > "$status_file"
else
  echo "$?" > "$status_file"
fi
test "$(cat "$status_file")" = "0"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
status_file="$TMPDIR/evidence/slice3-format.status"
log_file="$TMPDIR/evidence/slice3-format.log"
if NX_DAEMON=false bunx nx format:check --all \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— rehearsed: exit 0, report `114`/`114`/`0`, unchanged from step 0's own fresh baseline (section 6);
format check exit 0.

**The following block is PLANNER-ONLY.** The executor does not run it; reaching this point, it
reports each row as "pending planner verification" and stops.

```bash
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
git add -A -- \
  apps/wbs/fe-01/src/modules/preferences/contract.ts \
  apps/wbs/fe-01/src/modules/preferences/module.ts \
  apps/wbs/fe-01/src/modules/preferences/module.test.ts \
  apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts \
  apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts \
  apps/wbs/fe-01/src/runtime/application-runtime.ts \
  apps/wbs/fe-01/src/runtime/application-runtime.test.ts \
  apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
status_file="$TMPDIR/evidence/tool-devsync-test.status"
log_file="$TMPDIR/evidence/tool-devsync-test.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/build.status"
log_file="$TMPDIR/evidence/build.log"
if NX_DAEMON=false bunx nx run wbs-fe-01:build > "$log_file" 2>&1; then
  echo 0 > "$status_file"
else
  echo "$?" > "$status_file"
fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/wbs-fe-01-test-unit.status"
log_file="$TMPDIR/evidence/wbs-fe-01-test-unit.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:test:unit --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/wbs-fe-01-test.status"
log_file="$TMPDIR/evidence/wbs-fe-01-test.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:test --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

Observed in this rehearsal, each compared against the planner-only baseline captured before slice 1
(above; review 2, Important 5; review 3, Important 3 — this packet's own fresh capture, not packet c's):
`tool-devsync:test` — baseline `366 pass / 0 fail`, after `366 pass / 0 fail`, unchanged (an acceptance
criterion). `wbs-fe-01:build` — exit 0 at both baseline and after. `wbs-fe-01:test:unit` — baseline `48
files / 676 tests`, after `48 files / 694 tests`, eighteen more, no files added or removed. `wbs-fe-01:test`
(the whole jsdom-plus-zoned tier: `TZ=UTC` over the default config, then `TZ=Pacific/Auckland` over
`vitest.zoned.config.ts`, both `--no-file-parallelism --maxWorkers=1`) — **required: the UTC run's own
file count unchanged and its own test count eighteen more than its own pre-implementation baseline; the
Auckland run's own file and test counts both unchanged from its own baseline** (this packet touches no
`.test.ts` file `vitest.zoned.config.ts` itself selects — see section 3.3 — so the Auckland run's own
counts have no reason to move). Both the pre-implementation baseline (section 6's own opening
planner-only block) and this after-run **did not complete inside this response's own allowance** (the
target ran past 6m44s before an earlier rehearsal's own wrapper stopped it); both rows are **pending
planner verification with a longer allowance**, not claimed as compared.

**Ready to commit:** `tasks.md` and `verify.md` only.

Subject: `docs(plans): close task 4's follow-up note for 050-7-d`.

## 7. The code

### 7.1 Design record appendix, whole (slice 1)

Append this section, verbatim, to the end of
`docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md`:

```markdown
## Appendix (050-7-d, 2026-09-24): withdrawal closed from a consumer, not from the slot

`docs/superpowers/plans/2026-09-21-batch-6/050-7-c-application-context.md` section 4 left a bounded,
measured gap: a caller-supplied validator that retires or replaces its own runtime from inside
`isValid` still had its answer trusted on either branch, and `JSON.stringify`'s own re-entrant
`toJSON` had the same hazard on the write side, because nothing re-checked liveness between that
foreign code returning and the resource acting on it. Two earlier mechanisms tried to close the
validator case and were withdrawn as failed attempts — a consumer-side access-time guard that
checked only before delegation, and a source-level `withdraw` callback invoked from inside
`lifetime-slot.ts`'s own `accept()`, which broke ownership by running before that function's own
bookkeeping committed. Both are recorded in full, with their exact rehearsed observations, in
`docs/superpowers/plans/2026-09-21-batch-6/050-7-d-withdrawal-and-page-lifecycle.md` section 2, and
in packet c's own "Disposition of review 3" and "Disposition of review 4" sections.

**What 050-7-d found, by reading this file's own source rather than by trying a third variant of
either failed shape:** `publish()` (`lifetime-slot.ts:250-260`) assigns `state = next`
**synchronously**; only the subscriber notification is deferred to a microtask. `accept()`
(`lifetime-slot.ts:383-393`) calls `publish({ status: 'retiring' })` as part of its own synchronous
bookkeeping, before returning to `replace`/`retire`'s own caller. Consequently `slot.snapshot()`
already answers correctly, synchronously, the instant a request is accepted — including from inside a
validator, or a `toJSON`, that is itself, right now, on the call stack that triggered that same
`accept()`. No change to `lifetime-slot.ts` is needed; it was already true. `disposeWithdrawn()`
(`lifetime-slot.ts:294-304`) also begins running synchronously when nothing is already queued ahead of
it, but the design below does not depend on that fact: it only ever consults `slot.snapshot()`.

What was missing was a consumer positioned to ask the question at the right moments: once before
doing anything, and once more after any foreign code it had to run inline had returned — on **both**
the answer a validator could give, and after a serializer's own re-entrant call.
`preferences.resource.ts` is that consumer: it already calls `isValid` synchronously inside
`claim()` and `JSON.stringify` inside its own write path, and now also calls a supplied `isLive`
predicate — bound to a real slot's `snapshot()` by `application-runtime.ts`, never by
`lifetime-slot.ts` or `preferences.resource.ts` itself, preserving rule K2 — before `storage.read`,
after `isValid` returns (on **both** its accepting and refusing branches), and after
`JSON.stringify(value)` returns, before `storage.write`. See
`apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`'s `ensureLive` and
`050-7-d-withdrawal-and-page-lifecycle.md` section 4 for the full account and its rehearsed
sabotages.

**Why this is not a third attempt at either failed shape:** it is not the access-time guard, because
it checks after the foreign call returns, on every branch, not only before. It is not the `accept()`
callback, because it adds nothing to `lifetime-slot.ts`: `accept()`, `transition()` and
`disposeWithdrawn()` are unchanged, and the only file this packet's own tests extend is
`lifetime-slot.model.test.ts` — the test file, not the ownership rule it checks. The consumer only
ever calls the slot's already-public `snapshot()`.

**State/event tables: unchanged.** No new state, no new event, no new invariant. The **reference
model** in `lifetime-slot.model.test.ts` (the `Ownership` class) is unchanged in its own rule; two
new invariant methods are added to it (`neverSilentlyReadsPastLive`, unconditional on which runtime
is live, and a continuous, in-disposal check inside `buildInstalled`'s own `close()`), checked
against the same generated commands the file already produced — with the command loop's own bug
fixed so those commands can actually reach a live runtime before retiring or replacing it (a
`liveRetirements` counter, asserted `> 0` across the whole pinned run, is what makes this a checked
fact rather than an assumption). `preferences.resource.test.ts`'s own property generates validator
re-entrancy and accept/refuse/read-shape combinations with plain `fc.property`, not `fc.scheduler()`,
because a validator's (or a `toJSON`'s) re-entrant call is a single synchronous statement with no
scheduling ambiguity to generate — the genuinely schedulable part of the claim (captured handles
across real retirement, replacement and pending/rejecting/never-settling disposal) is what
`lifetime-slot.model.test.ts`'s own `fc.scheduler()`-based property already covers.

**What remains a limit:** this closes the gap for the preferences resource only — a future lifetime
that calls a caller-supplied validator synchronously inside its own resource layer needs the same
check built for it, and `IsRuntimeLive` is written generically enough to be reused, though nothing
forces that reuse. `IsRuntimeLive` is scoped to the **slot**, not to one runtime's own identity, and
precedence between its two refusal messages is read from the slot's **current** state, not
permanent: while the slot is not live, `WITHDRAWN` refuses every non-live reference; once a _later_
publication makes the slot live again — with anyone — a stale reference's own read reaches its own
store, and throws `REVOKED` there if that store has already been given back. A retired-then-later-replaced
reference is observed to flip from one message to the other, tested directly.
```

### 7.2 `preferences.resource.ts` and `preferences.resource.test.ts` — the diffs

```diff
--- a/apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts
@@ -1,4 +1,22 @@
-import type { BrowserStorage, Claim, Preferences, Remembered } from './contract';
+import type { BrowserStorage, Claim, IsRuntimeLive, Preferences, Remembered } from './contract';
+
+/**
+ * What every member of a {@link Remembered} throws once `isLive()` answers
+ * `false`, checked against the slot's own **current** state.
+ *
+ * Distinct from `browser-storage.repository.ts`'s `REVOKED`: that message is
+ * the store's own record that its disposal actually ran `revoke()`. This one
+ * fires from the instant `accept()` publishes `retiring`, before `revoke()`
+ * runs — but it is not the *only* message a caller can ever observe: once
+ * a later runtime becomes live, `isLive()` answers `true` again for a stale
+ * reference too (`IsRuntimeLive` asks "is something live here", not "is it
+ * still me" — see its own JSDoc), and that reference's own read then reaches
+ * its own store directly, which throws `REVOKED` if that store has already
+ * been given back. `WITHDRAWN` is what a reference sees *while the slot is
+ * not live*; `REVOKED` is what the *same* reference can see afterward, once
+ * it is.
+ */
+const WITHDRAWN = 'the page withdrew this preference store before the access completed';

 /** Stored bytes parsed as they were written, or `undefined` when they will not parse. */
 function parsedOrNothing(stored: string): unknown {
@@ -24,8 +42,40 @@ function parsedOrNothing(stored: string): unknown {
  * caller's: the width store drops entries for columns this reader no longer
  * has, and it must not write the sanitised set back — a step that is only
  * temporarily absent would lose its width for good.
+ *
+ * `isLive` defaults to always-`true`: every direct caller of this function —
+ * this file's own tests, and any code that builds a `Preferences` outside the
+ * preferences DI Bag module entirely — keeps today's behaviour exactly.
+ * Installing the module itself (`module.ts`) does **not** fall through to this
+ * default: the module's own `preferences` factory declares `isLive` as a host
+ * requirement, so a host that omits it gets `DI_BAG_MISSING_DEPENDENCY:
+ * Cannot resolve "preferences": dependency "isLive" is not registered.`
+ * rather than silently always-live preferences. A host built through a
+ * lifetime slot (`installApplicationRuntime`) passes its own
+ * `() => slot.snapshot().status === 'live'`; see {@link IsRuntimeLive}.
  */
-export function createPreferences(storage: BrowserStorage): Preferences {
+export function createPreferences(
+  storage: BrowserStorage,
+  isLive: IsRuntimeLive = () => true,
+): Preferences {
+  /**
+   * Refuses once this runtime has been withdrawn.
+   *
+   * Called before every `storage` access, **and again after any code this
+   * function has to run inline before it can decide what `storage` sees** —
+   * a caller-supplied validator (regardless of whether it accepts or
+   * refuses: a refusal is not exempt, since `readAndDrop`'s own
+   * `storage.forget` call must never run against a store a re-entrant
+   * validator has just withdrawn), and `json`'s own `JSON.stringify(value)`
+   * (a `toJSON` method or a getter it walks is exactly the same re-entrancy
+   * hazard on the write side). See
+   * `docs/superpowers/plans/2026-09-21-batch-6/050-7-d-withdrawal-and-page-lifecycle.md`
+   * section 4.
+   */
+  const ensureLive = (): void => {
+    if (!isLive()) throw new Error(WITHDRAWN);
+  };
+
   /** The three reads every shape shares, given one way of judging what is there. */
   const storeOver = <T>(
     key: string,
@@ -40,14 +90,21 @@ export function createPreferences(storage: BrowserStorage): Preferences {
     readAndDrop: () => {
       const claimed = claim();
       if (claimed.status === 'held') return claimed.value;
+      // `claim()` has already rechecked liveness after any validator it ran
+      // (see the claim thunks below), so reaching here with `refused` means
+      // this runtime is still live: dropping the key is safe.
       // Proof: making the refusal drop a no-op failed the JSON, unparsable JSON,
       // and bare-text refusal cases on `expected <stored value> to be
       // undefined`. Observed 2026-09-20.
       if (claimed.status === 'refused') storage.forget(key);
       return null;
     },
-    write,
+    write: (value) => {
+      ensureLive();
+      write(value);
+    },
     forget: () => {
+      ensureLive();
       storage.forget(key);
     },
   });
@@ -64,13 +121,32 @@ export function createPreferences(storage: BrowserStorage): Preferences {
         // told apart from a stored value that legitimately *is* the string
         // `'refused'`: several of these stores hold a union of short strings.
         () => {
+          ensureLive();
           const stored = storage.read(key);
           if (stored === null) return { status: 'absent' };
           const claimed = parsedOrNothing(stored);
-          return isValid(claimed) ? { status: 'held', value: claimed } : { status: 'refused' };
+          if (!isValid(claimed)) {
+            // Rechecked here, not only in the accepting branch below: a
+            // validator that withdraws and then refuses must still refuse
+            // for withdrawal, not quietly answer 'refused' — its caller
+            // (readAndDrop) would otherwise delete a key from a store this
+            // runtime no longer owns.
+            ensureLive();
+            return { status: 'refused' };
+          }
+          ensureLive();
+          return { status: 'held', value: claimed };
         },
         (value) => {
-          storage.write(key, JSON.stringify(value));
+          // `JSON.stringify` runs arbitrary caller-owned code (a `toJSON`
+          // method, or a getter reached while walking `value`) before this
+          // function ever touches `storage` — exactly the same re-entrancy
+          // hazard as a caller-supplied validator (section 3.2's own
+          // finding), just on the write side. Serialize first, then recheck
+          // liveness immediately before the write it could still prevent.
+          const serialized = JSON.stringify(value);
+          ensureLive();
+          storage.write(key, serialized);
         },
       ),
     text: <T extends string>(
@@ -82,9 +158,17 @@ export function createPreferences(storage: BrowserStorage): Preferences {
         // No parse to fail here, so absent and refused are the only two ways not
         // to hold a value.
         () => {
+          ensureLive();
           const stored = storage.read(key);
           if (stored === null) return { status: 'absent' };
-          return isValid(stored) ? { status: 'held', value: stored } : { status: 'refused' };
+          if (!isValid(stored)) {
+            // Same post-validator recheck as `json`'s own claim thunk above,
+            // on both branches, for the same reason.
+            ensureLive();
+            return { status: 'refused' };
+          }
+          ensureLive();
+          return { status: 'held', value: stored };
         },
         // Proof: JSON-stringifying this write failed the resource case on
         // `expected '"steps"' to be 'steps'` and the named-answer compatibility
@@ -95,8 +179,11 @@ export function createPreferences(storage: BrowserStorage): Preferences {
       storeOver<string>(
         key,
         // Never refused, so `readAndDrop` and `read` answer the same thing and
-        // the caller's own rule is the only judge there is.
+        // the caller's own rule is the only judge there is. No caller-supplied
+        // validator runs here, so one `ensureLive` before the read is the
+        // whole of it.
         () => {
+          ensureLive();
           const stored = storage.read(key);
           // Proof: treating the empty string as absent failed the unchecked-key
           // case on `expected { status: 'absent' } to deeply equal { status:

```

```diff
--- a/apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts
@@ -1,4 +1,5 @@
-import { expect, test } from 'vitest';
+import fc from 'fast-check';
+import { describe, expect, it, test } from 'vitest';

 import { fakeBrowserStorage } from './fake-browser-storage';
 import { createPreferences } from './preferences.resource';
@@ -93,3 +94,314 @@ test('a store that refuses access is not recovered from', () => {
   const held = createPreferences(refusing).json('wbs.demo', isColour);
   expect(() => held.read()).toThrow('site data blocked');
 });
+
+describe('once the runtime that owns this store is no longer live', () => {
+  /**
+   * A store whose own liveness can be flipped — models `lifetime-slot.ts`'s
+   * own synchronous `accept()` (`runtime/lifetime-slot.model.test.ts` and
+   * `application-runtime.test.ts` cover a real slot end to end; this file's
+   * own job is the resource's response to that signal, isolated).
+   */
+  interface Liveness {
+    live: boolean;
+    readonly isLive: () => boolean;
+  }
+  const createLiveness = (): Liveness => {
+    const state: Liveness = { live: true, isLive: () => state.live };
+    return state;
+  };
+
+  /**
+   * `fakeBrowserStorage`'s own `held()` records the bytes a write left
+   * behind, but a `read` has no side effect to observe that way — a pre-check
+   * moved to run *after* `storage.read` still throws before returning
+   * anything, so a test that only checks the thrown message and the stored
+   * bytes cannot tell "never read" from "read, then refused to answer".
+   * This wraps the same fake with an access log so a test can assert the
+   * store itself was never asked, not only that nothing came back.
+   */
+  interface RecordingStorage {
+    readonly read: (key: string) => string | null;
+    readonly write: (key: string, value: string) => void;
+    readonly forget: (key: string) => void;
+    readonly held: () => Record<string, string>;
+    readonly reads: () => readonly string[];
+  }
+  const recordingBrowserStorage = (seed: Record<string, string> = {}): RecordingStorage => {
+    const store = fakeBrowserStorage(seed);
+    const reads: string[] = [];
+    return {
+      read: (key) => {
+        reads.push(key);
+        return store.read(key);
+      },
+      write: store.write,
+      forget: store.forget,
+      held: store.held,
+      reads: () => reads,
+    };
+  };
+
+  describe('the pre-check: an operation begun after withdrawal refuses, and never reaches the store at all', () => {
+    /**
+     * `unchecked`'s own write has no second, shape-specific check of its own
+     * (unlike `json`'s, section 4.2 item 2's own third `ensureLive()` call) —
+     * this is `storeOver`'s **shared** pre-check, exercised on a shape where
+     * nothing else could mask its removal.
+     */
+    test('a write refuses, and never reaches the store', () => {
+      const store = fakeBrowserStorage();
+      const withdrawn = createLiveness();
+      const held = createPreferences(store, withdrawn.isLive).unchecked('wbs.demo.id');
+      withdrawn.live = false;
+
+      expect(() => {
+        held.write('p1');
+      }).toThrow('the page withdrew this preference store before the access completed');
+      expect(store.held()).toEqual({});
+    });
+
+    test('a forget refuses, and never reaches the store', () => {
+      const store = fakeBrowserStorage({ 'wbs.demo': '"dark"' });
+      const withdrawn = createLiveness();
+      const held = createPreferences(store, withdrawn.isLive).json('wbs.demo', isColour);
+      withdrawn.live = false;
+
+      expect(() => {
+        held.forget();
+      }).toThrow('the page withdrew this preference store');
+      expect(store.held()).toEqual({ 'wbs.demo': '"dark"' });
+    });
+
+    /**
+     * Important 1 (review 2): a fake that only records bytes cannot prove a
+     * read never happened — throwing after an unauthorized read would still
+     * satisfy a test that checks only the thrown message. `recordingStore`
+     * asserts the store's own `read` was never called at all, including for
+     * the absent-value case, which carries no bytes to check either way.
+     */
+    test('a JSON read refuses before the store, or the validator, is ever reached', () => {
+      const recordingStore = recordingBrowserStorage({ 'wbs.demo': '"dark"' });
+      const withdrawn = createLiveness();
+      let validatorRan = false;
+      const held = createPreferences(recordingStore, withdrawn.isLive).json(
+        'wbs.demo',
+        (claimed) => {
+          validatorRan = true;
+          return isColour(claimed);
+        },
+      );
+      withdrawn.live = false;
+
+      expect(() => held.read()).toThrow('the page withdrew this preference store');
+      expect(() => held.readAndDrop()).toThrow('the page withdrew this preference store');
+      expect(validatorRan).toBe(false);
+      expect(recordingStore.reads()).toEqual([]);
+      expect(recordingStore.held()).toEqual({ 'wbs.demo': '"dark"' });
+    });
+
+    test('a JSON read of an absent key still never reaches the store once withdrawn', () => {
+      const recordingStore = recordingBrowserStorage();
+      const withdrawn = createLiveness();
+      const held = createPreferences(recordingStore, withdrawn.isLive).json('wbs.demo', isColour);
+      withdrawn.live = false;
+
+      expect(() => held.read()).toThrow('the page withdrew this preference store');
+      expect(recordingStore.reads()).toEqual([]);
+    });
+
+    test('a bare-text read refuses before the store, or the validator, is ever reached', () => {
+      const recordingStore = recordingBrowserStorage({ 'wbs.demo.section': 'steps' });
+      const withdrawn = createLiveness();
+      let validatorRan = false;
+      const held = createPreferences(recordingStore, withdrawn.isLive).text(
+        'wbs.demo.section',
+        (stored) => {
+          validatorRan = true;
+          return isSection(stored);
+        },
+      );
+      withdrawn.live = false;
+
+      expect(() => held.read()).toThrow('the page withdrew this preference store');
+      expect(validatorRan).toBe(false);
+      expect(recordingStore.reads()).toEqual([]);
+    });
+
+    test('an unchecked read refuses before the store is ever reached', () => {
+      const recordingStore = recordingBrowserStorage({ 'wbs.demo.id': 'p1' });
+      const withdrawn = createLiveness();
+      const held = createPreferences(recordingStore, withdrawn.isLive).unchecked('wbs.demo.id');
+      withdrawn.live = false;
+
+      expect(() => held.read()).toThrow('the page withdrew this preference store');
+      expect(recordingStore.reads()).toEqual([]);
+    });
+  });
+
+  describe('the write-serialization recheck: JSON.stringify running caller code', () => {
+    /**
+     * Important 1 (review 2): `JSON.stringify(value)` runs `value`'s own
+     * `toJSON()` before `write`'s own body ever calls `storage.write` — a
+     * hazard on the write side with the same shape as a re-entrant
+     * validator. Rechecking liveness only *before* serialization (as a
+     * single pre-check would) misses this gap entirely.
+     */
+    test('a value whose toJSON withdraws the runtime is never written', () => {
+      const store = fakeBrowserStorage();
+      const withdrawn = createLiveness();
+      const held = createPreferences(store, withdrawn.isLive).json<{ readonly test: number }>(
+        'wbs.demo',
+        (claimed): claimed is { readonly test: number } =>
+          typeof claimed === 'object' && claimed !== null && 'test' in claimed,
+      );
+      const reenteringValue = {
+        test: 1,
+        toJSON(): { readonly test: number } {
+          withdrawn.live = false; // the re-entrant `slot.retire()`/`replace()`, modelled
+          return { test: this.test };
+        },
+      };
+
+      expect(() => {
+        held.write(reenteringValue);
+      }).toThrow('the page withdrew this preference store before the access completed');
+      expect(store.held()).toEqual({});
+    });
+  });
+
+  describe('the post-validator recheck: a validator that withdraws its own runtime, from a fresh live fixture', () => {
+    /**
+     * Every example in this block starts `withdrawn.live` at `true` — the
+     * fixture is live until the validator itself, mid-call, withdraws it —
+     * so each one exercises the recheck *after* `isValid` returns, never the
+     * pre-check above. Review 1's own finding: an example that starts already
+     * withdrawn "exercises the pre-check", not this one.
+     */
+
+    test('JSON, accepting: the accepted value is not returned', () => {
+      const store = fakeBrowserStorage({ 'wbs.demo': '"dark"' });
+      const withdrawn = createLiveness();
+      const reenteringIsValid = (claimed: unknown): claimed is 'light' | 'dark' => {
+        withdrawn.live = false; // the re-entrant `slot.retire()`/`replace()`, modelled
+        return claimed === 'light' || claimed === 'dark'; // and it accepts anyway
+      };
+      const held = createPreferences(store, withdrawn.isLive).json('wbs.demo', reenteringIsValid);
+
+      expect(() => held.read()).toThrow('the page withdrew this preference store');
+      expect(() => held.readAndDrop()).toThrow('the page withdrew this preference store');
+    });
+
+    /**
+     * Critical 1: a refusing validator that withdraws must not let
+     * `readAndDrop` reach `storage.forget` — the recheck after `isValid`
+     * returns runs on **both** branches, and `readAndDrop` only calls
+     * `forget` after `claim()` has already returned, so a throw from inside
+     * `claim()` here means `forget` is never reached at all.
+     */
+    test('JSON, refusing: the refusal itself still refuses for withdrawal, and the key survives', () => {
+      const store = fakeBrowserStorage({ 'wbs.demo': '"midnight"' });
+      const withdrawn = createLiveness();
+      const reenteringIsValid = (_claimed: unknown): _claimed is 'light' | 'dark' => {
+        withdrawn.live = false;
+        return false;
+      };
+      const held = createPreferences(store, withdrawn.isLive).json('wbs.demo', reenteringIsValid);
+
+      expect(() => held.read()).toThrow('the page withdrew this preference store');
+      expect(store.held()).toEqual({ 'wbs.demo': '"midnight"' });
+
+      const fresh = createLiveness();
+      const alsoWithdraws = (_claimed: unknown): _claimed is 'light' | 'dark' => {
+        fresh.live = false;
+        return false;
+      };
+      const heldAgain = createPreferences(store, fresh.isLive).json('wbs.demo', alsoWithdraws);
+      expect(() => heldAgain.readAndDrop()).toThrow('the page withdrew this preference store');
+      expect(store.held()).toEqual({ 'wbs.demo': '"midnight"' });
+    });
+
+    test('bare text, accepting: the accepted value is not returned', () => {
+      const store = fakeBrowserStorage({ 'wbs.demo.section': 'steps' });
+      const withdrawn = createLiveness();
+      const reenteringIsValid = (stored: string): stored is 'teams' | 'steps' => {
+        withdrawn.live = false;
+        return stored === 'teams' || stored === 'steps';
+      };
+      const held = createPreferences(store, withdrawn.isLive).text(
+        'wbs.demo.section',
+        reenteringIsValid,
+      );
+
+      expect(() => held.read()).toThrow('the page withdrew this preference store');
+    });
+
+    /**
+     * The bare-text shape's own post-check had zero coverage before this
+     * example: its only prior test started already withdrawn and so never
+     * reached `isValid` at all. This one is the fresh-fixture, re-entrant
+     * case, and `readAndDrop` must not delete the key either.
+     */
+    test('bare text, refusing: the refusal itself still refuses for withdrawal, and the key survives', () => {
+      const store = fakeBrowserStorage({ 'wbs.demo.section': 'nonsense' });
+      const withdrawn = createLiveness();
+      const reenteringIsValid = (_stored: string): _stored is 'teams' | 'steps' => {
+        withdrawn.live = false;
+        return false;
+      };
+      const held = createPreferences(store, withdrawn.isLive).text(
+        'wbs.demo.section',
+        reenteringIsValid,
+      );
+
+      expect(() => held.readAndDrop()).toThrow('the page withdrew this preference store');
+      expect(store.held()).toEqual({ 'wbs.demo.section': 'nonsense' });
+    });
+  });
+
+  /**
+   * A validator generates its own re-entrant behaviour, over every
+   * combination of accept/refuse, read/readAndDrop and whether it withdraws
+   * before answering — always from a fresh live fixture, and always
+   * asserting the stored bytes as well as the thrown message. Not
+   * `fc.scheduler()`: a validator's re-entrant call to `retire`/`replace` is
+   * a single synchronous statement, fully ordered by the call stack that
+   * contains it — there is no scheduling ambiguity to generate here.
+   * `lifetime-slot.model.test.ts`'s own extended property is where generated
+   * interleavings of a *real* slot, real retirement/replacement and real
+   * pending/failed disposal are exercised.
+   */
+  it('never returns a value, and never deletes a refused key, once its own validator has withdrawn the runtime', () => {
+    fc.assert(
+      fc.property(
+        fc.constantFrom('accept', 'refuse'),
+        fc.constantFrom('read', 'readAndDrop'),
+        fc.boolean(),
+        (verdict, operation, withdrawsFirst) => {
+          const store = fakeBrowserStorage({ 'wbs.demo': '"dark"' });
+          const withdrawn = createLiveness();
+          const isValid = (claimed: unknown): claimed is 'light' | 'dark' => {
+            if (withdrawsFirst) withdrawn.live = false;
+            return verdict === 'accept' && (claimed === 'light' || claimed === 'dark');
+          };
+          const held = createPreferences(store, withdrawn.isLive).json('wbs.demo', isValid);
+
+          const read = (): 'dark' | 'light' | null =>
+            operation === 'read' ? held.read() : held.readAndDrop();
+
+          if (withdrawsFirst) {
+            expect(read).toThrow('the page withdrew this preference store');
+            // Critical 1: withdrawal refuses before either branch is acted
+            // on, so the stored bytes are untouched regardless of verdict.
+            expect(store.held()).toEqual({ 'wbs.demo': '"dark"' });
+          } else if (verdict === 'accept') {
+            expect(read()).toBe('dark');
+          } else {
+            expect(read()).toBeNull();
+          }
+        },
+      ),
+      { seed: 20260924, numRuns: 200 },
+    );
+  });
+});

```

### 7.3 `contract.ts`, `module.ts`, `module.test.ts`, `application-runtime.ts`, `application-runtime.test.ts` — the diffs

```diff
--- a/apps/wbs/fe-01/src/modules/preferences/contract.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/contract.ts
@@ -139,16 +139,54 @@ export interface RevocableBrowserStorage extends BrowserStorage {
   readonly revoke: () => void;
 }

+/**
+ * Whether the runtime that owns a store is still the one a lifetime slot is
+ * publishing, checked synchronously.
+ *
+ * `createLifetimeSlot`'s own `accept()` (`runtime/lifetime-slot.ts`) assigns its
+ * published state **synchronously** — only the subscriber notification is
+ * deferred to a microtask — so `() => slot.snapshot().status === 'live'` is
+ * already correct the instant withdrawal is accepted, including from inside a
+ * caller-supplied validator that re-enters and asks for a replacement or a
+ * retirement of its own. Nothing about this predicate is specific to
+ * preferences; it is named here because this module is its first caller. See
+ * `preferences.resource.ts`'s `ensureLive` for what refuses once it answers
+ * `false`.
+ *
+ * **Scoped to the slot, not to one runtime's identity.** A stale reference
+ * from a runtime the slot has since *replaced* (rather than emptied) reads
+ * `true` again once the newer runtime is live — this predicate answers "is
+ * something live here", not "is it still me". For a `replace`d (not merely
+ * `retire`d) runtime, a stale reference's own storage is what still refuses,
+ * once that runtime's own disposal has revoked it (`browser-storage.repository.ts`'s
+ * `REVOKED`) — see
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-d-withdrawal-and-page-lifecycle.md`
+ * section 4.4 for the precedence this implies and the test that proves it.
+ */
+export type IsRuntimeLive = () => boolean;
+
 /**
  * What a host graph must supply to install the preferences module.
  *
- * The raw store adapter and nothing else. It is the host's because reaching this
- * browser's own key-value store is the page's infrastructure, and it is a
- * requirement rather than a module-private binding so that a host which forgets
- * it is told **which module** asked: see {@link PREFERENCES_LABEL}.
+ * The raw store adapter, and a way to ask whether this installation's own
+ * runtime is still live. Both are **required** registrations of the module
+ * itself (`module.ts`'s `preferences` factory declares `isLive` as a
+ * dependency the same way it declares `preferencesStore`): a host that omits
+ * `isLive` gets `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "preferences":
+ * dependency "isLive" is not registered.` — not a silent default, and not the
+ * `DI_BAG_MISSING_REGISTRATION` code, which is what resolving a name nobody
+ * ever registered (`preferencesStore` itself, from outside the module)
+ * answers instead; see `module.ts`'s own JSDoc for that distinct case.
+ * `createPreferences`'s own always-`true` default (`preferences.resource.ts`)
+ * only applies to code that builds a `Preferences` directly, bypassing this
+ * module — it is not a fallback the module's own DI Bag registration can use.
+ * Both are requirements rather than module-private bindings so that a host
+ * which forgets one is told **which module** asked: see
+ * {@link PREFERENCES_LABEL}.
  */
 export interface PreferencesRequirements {
   readonly browserStore: BrowserStorage;
+  readonly isLive: IsRuntimeLive;
 }

 /**
--- a/apps/wbs/fe-01/src/modules/preferences/module.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/module.ts
@@ -3,6 +3,7 @@ import { DiBag } from 'di-bag';
 import { revocableStorage } from './browser-storage.repository';
 import {
   type BrowserStorage,
+  type IsRuntimeLive,
   type Preferences,
   PREFERENCES_LABEL,
   type RememberedPreferences,
@@ -26,6 +27,16 @@ import { createPreferences } from './preferences.resource';
  * which is what makes a host that forgets it say which module asked:
  * `Cannot resolve "frontend.preferences/preferencesStore": dependency
  * "browserStore" is not registered.`
+ *
+ * `isLive` is the module's second host requirement: a synchronous predicate
+ * `preferences.resource.ts` re-checks around every caller-supplied validator,
+ * on both its accepting and refusing branches, so a runtime withdrawn while
+ * `isValid` is still on the stack cannot have its own answer trusted either
+ * way. `application-runtime.ts` is the one host that wires it to a real
+ * lifetime slot; every other host — including this module's own tests —
+ * registers `() => true`. This is a **required** registration of the module
+ * itself, not a fallback: `createPreferences`'s own always-`true` default
+ * only applies to code that calls it directly, bypassing this module.
  */
 export const preferencesModule = DiBag.createBuilder()
   .register({
@@ -42,9 +53,18 @@ export const preferencesModule = DiBag.createBuilder()
     ),
   })
   .register({
+    // `preferencesStore` destructured before `isLive`: a host that supplies
+    // neither is told about the missing `browserStore` behind `preferencesStore`
+    // first, matching this module's own established resolution-order fact —
+    // see module.test.ts's "names itself when a host omits the browser store".
     preferences: DiBag.fromSyncFactory(
-      ({ preferencesStore }: { preferencesStore: RevocableBrowserStorage }): Preferences =>
-        createPreferences(preferencesStore),
+      ({
+        preferencesStore,
+        isLive,
+      }: {
+        preferencesStore: RevocableBrowserStorage;
+        isLive: IsRuntimeLive;
+      }): Preferences => createPreferences(preferencesStore, isLive),
     ),
   })
   .register({
--- a/apps/wbs/fe-01/src/modules/preferences/module.test.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/module.test.ts
@@ -19,6 +19,7 @@ const hostOver = (store: ReturnType<typeof fakeBrowserStorage>) =>
   DiBag.createBuilder()
     .installModule(preferencesModule)
     .register({ browserStore: DiBag.fromSyncFactory(() => store) })
+    .register({ isLive: DiBag.fromSyncFactory((): (() => boolean) => () => true) })
     .build();

 describe('the preferences module', () => {
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -3,6 +3,7 @@ import { DiBag } from 'di-bag';
 import { browserStorage } from '@/modules/preferences/browser-storage.repository';
 import type {
   BrowserStorage,
+  IsRuntimeLive,
   Preferences,
   RememberedPreferences,
 } from '@/modules/preferences/contract';
@@ -73,10 +74,21 @@ export function acquireTransactionally<S>(
   }
 }

-/** The one dependency of the page's runtime: how this browser's store is reached. */
+/** The page's runtime's own dependencies: its store, and its own liveness. */
 export interface ApplicationDependencies {
   /** Defaults to the real adapter; a test passes a fake, and nothing else does. */
   readonly openStore: () => BrowserStorage;
+  /**
+   * Whether this installation's own runtime is still the one a lifetime slot
+   * is publishing, checked synchronously — see `contract.ts`'s
+   * {@link IsRuntimeLive}. Optional because most callers of
+   * {@link installApplicationRuntime} — every test that builds a runtime
+   * directly, without a slot — never retire anything and so never need it;
+   * omitting it keeps this module's preferences always live, exactly as
+   * before this dependency existed. {@link acquireApplicationRuntime} is the
+   * one caller that supplies the real one.
+   */
+  readonly isLive?: IsRuntimeLive;
 }

 /**
@@ -96,9 +108,11 @@ export interface ApplicationDependencies {
 export function installApplicationRuntime(
   dependencies: ApplicationDependencies = { openStore: browserStorage },
 ): RetirableRuntime<ApplicationServices> {
+  const isLive = dependencies.isLive ?? (() => true);
   const bag = DiBag.createBuilder()
     .installModule(preferencesModule)
     .register({ browserStore: DiBag.fromSyncFactory(() => dependencies.openStore()) })
+    .register({ isLive: DiBag.fromSyncFactory(() => isLive) })
     .build();
   // Proof: on 2026-09-22, returning the bag made this surface enumerate
   // ['preferences', 'remembered', 'bag'] (1 failed, 41 passed).
@@ -121,6 +135,24 @@ export function installApplicationRuntime(
 export const applicationSlot: LifetimeSlot<ApplicationServices> =
   createLifetimeSlot<ApplicationServices>();

-/** The production acquisition, named so a caller passes a function and not a call. */
+/**
+ * The production acquisition, named so a caller passes a function and not a call.
+ *
+ * The one production wiring of `isLive`: `applicationSlot.snapshot().status ===
+ * 'live'`, checked against the same slot this factory is passed to
+ * (`applicationSlot.replace(acquireApplicationRuntime)`, in
+ * `application-bootstrap.tsx`). Reading `applicationSlot` from inside this
+ * closure rather than importing it into `preferences.resource.ts` or
+ * `module.ts` is what keeps rule K2's boundary: the slot is runtime
+ * infrastructure, and only this composition root — never a module beneath
+ * it — is allowed to know its own lifetime slot exists. Proved end to end,
+ * through this real singleton, by `application-runtime.test.ts`'s own
+ * "refuses a captured reference through the production singleton…" example —
+ * not only by the equivalent, non-singleton example built against a
+ * purpose-built slot.
+ */
 export const acquireApplicationRuntime: Acquire<ApplicationServices> = () =>
-  installApplicationRuntime();
+  installApplicationRuntime({
+    openStore: browserStorage,
+    isLive: () => applicationSlot.snapshot().status === 'live',
+  });
--- a/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
@@ -5,8 +5,10 @@ import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';
 import { THEME_KEY } from '@/modules/preferences/preference-keys';

 import {
+  acquireApplicationRuntime,
   acquireTransactionally,
   type ApplicationServices,
+  applicationSlot,
   installApplicationRuntime,
 } from './application-runtime';
 import {
@@ -186,7 +188,12 @@ describe('the page’s runtime, installed transactionally', () => {
     expect(typeof services.remembered.lastOpenedProject.read).toBe('function');
   });

-  /** Retirement gives the store back, through the slot the page really uses. */
+  /**
+   * Retirement gives the store back, through the slot the page really uses —
+   * unchanged: this test does not wire `isLive` to the slot, so `ensureLive`
+   * keeps its own always-`true` default and this reference still falls all
+   * the way through to `REVOKED`, exactly as before 050-7-d.
+   */
   it('revokes the store it owns when the slot retires it', async () => {
     const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);
     const store = fakeBrowserStorage();
@@ -203,6 +210,145 @@ describe('the page’s runtime, installed transactionally', () => {
     }).toThrow('the preferences store was revoked with its runtime');
   });

+  describe('once isLive is wired to a real slot', () => {
+    /**
+     * Precedence is read from the slot's own **current** state, not from
+     * what happened to a runtime in the past: `ensureLive` refuses
+     * `WITHDRAWN` whenever `slot.snapshot().status !== 'live'`, and once the
+     * slot is `live` again — with anyone — a stale reference's own read
+     * proceeds to its own store, which reaches `REVOKED` if that store has
+     * already been given back. Nothing here is "permanent"; it tracks the
+     * slot, moment to moment.
+     */
+    it('refuses a captured reference the instant retirement is accepted', async () => {
+      const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>();
+      const store = fakeBrowserStorage();
+      const services = await slot.replace(() =>
+        installApplicationRuntime({
+          openStore: () => store,
+          isLive: () => slot.snapshot().status === 'live',
+        }),
+      );
+      const detail = services.remembered.ganttDetail;
+
+      // Not awaited: `accept()` (`lifetime-slot.ts`) withdraws publication
+      // synchronously, so `slot.snapshot().status` is already `retiring` here
+      // — regardless of whether `disposeWithdrawn()`'s own bounded close has
+      // itself started (it typically has, by this point, when nothing else
+      // is queued ahead of this transition; `ensureLive` does not depend on
+      // that timing either way).
+      const retiring = slot.retire();
+      expect(slot.snapshot().status).toBe('retiring');
+
+      expect(() => {
+        detail.write(true);
+      }).toThrow('the page withdrew this preference store before the access completed');
+
+      await retiring;
+    });
+
+    it('keeps refusing WITHDRAWN while the slot stays non-live, once retirement has fully settled', async () => {
+      const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);
+      const store = fakeBrowserStorage();
+      const services = await slot.replace(() =>
+        installApplicationRuntime({
+          openStore: () => store,
+          isLive: () => slot.snapshot().status === 'live',
+        }),
+      );
+      const detail = services.remembered.ganttDetail;
+
+      await slot.retire();
+      expect(slot.snapshot().status).toBe('empty');
+
+      expect(() => {
+        detail.write(true);
+      }).toThrow('the page withdrew this preference store before the access completed');
+    });
+
+    /**
+     * `IsRuntimeLive`'s own JSDoc names this scope limit: the predicate asks
+     * "is something live here", not "is it still me". Once a *newer* runtime
+     * is live, a stale reference from a runtime the slot has moved past
+     * passes `ensureLive()` again and reaches its own, already-revoked
+     * store — `REVOKED`, not `WITHDRAWN`, is what actually fires for this
+     * one case. Proved two ways: a direct `replace` while the reference was
+     * still live, and — the case review 2 asked to be added explicitly — a
+     * `retire` (settling to `empty`, `WITHDRAWN` observed there) followed
+     * later by a separate `replace`, after which the same reference flips
+     * from `WITHDRAWN` to `REVOKED` without any code of its own changing.
+     */
+    it('lets a stale reference from a REPLACED runtime reach REVOKED, once a newer runtime is live', async () => {
+      const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);
+      const isLive = (): boolean => slot.snapshot().status === 'live';
+      const oldStore = fakeBrowserStorage();
+      const oldServices = await slot.replace(() =>
+        installApplicationRuntime({ openStore: () => oldStore, isLive }),
+      );
+      const staleDetail = oldServices.remembered.ganttDetail;
+
+      const newStore = fakeBrowserStorage();
+      await slot.replace(() => installApplicationRuntime({ openStore: () => newStore, isLive }));
+      expect(slot.snapshot().status).toBe('live');
+
+      expect(() => {
+        staleDetail.write(true);
+      }).toThrow('the preferences store was revoked with its runtime');
+    });
+
+    it('flips a retired reference from WITHDRAWN to REVOKED once a LATER replace makes the slot live again', async () => {
+      const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);
+      const isLive = (): boolean => slot.snapshot().status === 'live';
+      const firstStore = fakeBrowserStorage();
+      const firstServices = await slot.replace(() =>
+        installApplicationRuntime({ openStore: () => firstStore, isLive }),
+      );
+      const staleDetail = firstServices.remembered.ganttDetail;
+
+      await slot.retire();
+      expect(slot.snapshot().status).toBe('empty');
+      expect(() => {
+        staleDetail.write(true);
+      }).toThrow('the page withdrew this preference store before the access completed');
+
+      const secondStore = fakeBrowserStorage();
+      await slot.replace(() => installApplicationRuntime({ openStore: () => secondStore, isLive }));
+      expect(slot.snapshot().status).toBe('live');
+
+      expect(() => {
+        staleDetail.write(true);
+      }).toThrow('the preferences store was revoked with its runtime');
+    });
+  });
+
+  /**
+   * The production wiring, proved through the real singleton it is written
+   * against — not only through the equivalent, purpose-built slot above.
+   * `applicationSlot` is a module-level singleton shared by every test in
+   * this file; this is the only one that drives it, and it awaits full
+   * settlement so the slot is back at `empty` for anything that runs after.
+   */
+  it('refuses a captured reference through the production singleton once withdrawal is accepted', async () => {
+    const services = await applicationSlot.replace(acquireApplicationRuntime);
+    const detail = services.remembered.ganttDetail;
+
+    const retiring = applicationSlot.retire();
+    expect(applicationSlot.snapshot().status).toBe('retiring');
+
+    // Proof: on 2026-09-24, changing `acquireApplicationRuntime`'s own
+    // `isLive` to `() => true` made this receive a `ReferenceError` from the
+    // real browser-store adapter's own missing global instead of the
+    // expected message — the write reached `browserStorage()`'s real
+    // adapter, in a suite with no DOM (`vitest.node-suites.ts:77`), because
+    // nothing stopped it first.
+    expect(() => {
+      detail.write(true);
+    }).toThrow('the page withdrew this preference store before the access completed');
+
+    await retiring;
+    expect(applicationSlot.snapshot().status).toBe('empty');
+  });
+
   it('gives its retirement the production budget when the slot is built with none', async () => {
     const budgets: number[] = [];
     const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>();

```

### 7.4 What section 4.3's four proofs and section 4.4's precedence tests actually observed

Every example in `describe('once isLive is wired to a real slot', …)` and the production-singleton
example were rehearsed fresh: all fourteen green (9 pre-existing + 5 new). Each of the four
`isLive`-mutation Proof comments an earlier draft carried was independently re-rehearsed in this
response (section 8), and the ineffective one (mutating the always-live-now `REPLACED` test's own
predicate to `() => true`) is not claimed as a negative anywhere in this revision — that test's own
assertion (`REVOKED`) does not change under that specific mutation, because the reference's own store
was already revoked before the newer runtime went live regardless of what its `isLive` answers.

### 7.5 (no separate listing — the production-singleton example is given whole in section 7.3's own diff)

### 7.6 `lifetime-slot.model.test.ts` — the diff

```diff
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
@@ -4,7 +4,7 @@ import { describe, expect, it } from 'vitest';

 import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';

-import { installApplicationRuntime } from './application-runtime';
+import { type ApplicationServices, installApplicationRuntime } from './application-runtime';
 import {
   createLifetimeSlot,
   type LifetimeSlot,
@@ -31,6 +31,17 @@ interface Tracked {
   graphClosed: boolean;
   /** Answers whether the installed store has been revoked, or `null` when there is none. */
   probeRevoked: (() => boolean) | null;
+  /**
+   * Answers whether reading through the installed runtime throws at all —
+   * for any reason, `WITHDRAWN` (050-7-d, from the instant `accept()` ran)
+   * or `REVOKED` (once its own disposal has actually run) alike — or `null`
+   * when there is none. Distinct from {@link probeRevoked}, which matches the
+   * `REVOKED` message specifically and is therefore masked by `WITHDRAWN`
+   * whenever nothing else is currently live — see `storesFollowTheirGraphs`'s
+   * own JSDoc for exactly when that masking applies and why this probe does
+   * not need the same exception.
+   */
+  probeReadFails: (() => boolean) | null;
 }

 /**
@@ -72,6 +83,7 @@ class Ownership {
       closeSettles: 0,
       graphClosed: false,
       probeRevoked: null,
+      probeReadFails: null,
     };
     this.runtimes.push(record);
     return record;
@@ -91,24 +103,64 @@ class Ownership {
   }

   /**
-   * An installed runtime's store is revoked exactly when its graph was closed.
+   * An installed runtime's store is revoked exactly when its graph was closed
+   * — **while something is currently live**.
    *
    * The production half of invariant 2: "the close was attempted" is what the
    * owner controls, and "the store was given back" is what a reader's browser
    * actually observes. A live runtime's store is never revoked, or the page would
    * be holding services that refuse every preference.
+   *
+   * **`live === null` is excluded, and this is a design fact, not a gap in
+   * this check.** `probeRevoked` reads through `ensureLive` (050-7-d), and
+   * `ensureLive` refuses with `WITHDRAWN` — a message that does not contain
+   * `'revoked'` — from the instant `accept()` ran, *before* `storage.read` is
+   * ever reached. While the slot itself holds nothing live, every non-live
+   * runtime's own `isLive()` therefore answers `false` and every read is
+   * intercepted by `WITHDRAWN` first, regardless of whether that runtime's
+   * own disposal has actually finished — `REVOKED` becomes observable through
+   * a read again only once a *later* runtime is live (`isLive()` answers
+   * `true` again), which is exactly what happens once a request that was
+   * previously refused settles and the slot moves to `live` with someone
+   * else. {@link neverSilentlyReadsPastLive} covers the `live === null` case
+   * instead: every non-live runtime's read still throws there, for either
+   * reason, which is the guarantee that case actually admits.
    */
   storesFollowTheirGraphs(live: string | null): void {
+    if (live === null) return;
     for (const runtime of this.runtimes) {
       const probe = runtime.probeRevoked;
       if (probe === null || runtime.acquisitions === 0) continue;
       expect(
         probe(),
-        `${runtime.name}: revoked=${String(probe())}, graphClosed=${String(runtime.graphClosed)}, live=${String(live)}`,
+        `${runtime.name}: revoked=${String(probe())}, graphClosed=${String(runtime.graphClosed)}, live=${live}`,
       ).toBe(runtime.graphClosed);
       if (runtime.name === live) expect(probe(), `${runtime.name} is live and revoked`).toBe(false);
     }
   }
+
+  /**
+   * 050-7-d's own withdrawal invariant, over the same generated interleavings,
+   * **unconditional** on `live`: a runtime that is not the live one never
+   * answers a read, for either reason — `WITHDRAWN` from the instant its own
+   * `accept()` ran, `REVOKED` once its own disposal has completed. Holds
+   * regardless of whether something else is currently live, because the slot
+   * serializes transitions one at a time: a runtime the slot has since
+   * replaced has *already* had its own disposal fully awaited — successfully
+   * — before any newer runtime could become live at all (a disposal that
+   * rejects or times out makes the slot fatal instead, per invariant 7), so
+   * there is no interval where a stale reference's read could succeed.
+   */
+  neverSilentlyReadsPastLive(live: string | null): void {
+    for (const runtime of this.runtimes) {
+      const probe = runtime.probeReadFails;
+      if (probe === null || runtime.acquisitions === 0 || runtime.name === live) continue;
+      expect(
+        probe(),
+        `${runtime.name} is not live (live=${String(live)}) but its read did not throw`,
+      ).toBe(true);
+    }
+  }
 }

 /** A generated request against the slot. */
@@ -161,6 +213,17 @@ const commandArb: fc.Arbitrary<Command> = fc.oneof(
  */
 describe('the ownership rule, under generated interleavings', () => {
   it('holds every invariant it claims', async () => {
+    /**
+     * 050-7-d (review 2, Critical 2): counts, across the **whole pinned run**
+     * (every one of the property's own iterations, not just one), how many
+     * `retire`/`replace` commands were issued while the slot was genuinely
+     * `live`. Declared outside the property body so it accumulates across
+     * iterations; asserted once, after `fc.assert` returns, that this
+     * happened at least once — a property whose every run only ever retires
+     * or replaces an `empty` slot proves nothing about withdrawing a live
+     * runtime, which is the one thing this packet's own invariants need.
+     */
+    let liveRetirements = 0;
     await fc.assert(
       fc.asyncProperty(
         fc.scheduler(),
@@ -238,11 +301,28 @@ describe('the ownership rule, under generated interleavings', () => {
            * synchronous revocation that can neither reject nor hang. The rejecting
            * and never-settling flavours therefore stay with the generated graphs
            * above, which is where a socket or a timer will be modelled.
+           *
+           * `isLive` is wired to this same generated `slot` (050-7-d): the
+           * production predicate, exercised under the same generated
+           * interleavings — including re-entrant requests from a factory or a
+           * listener, and a live runtime actually being retired or replaced
+           * (`liveRetirements`, below) — not only in named examples.
            */
           const buildInstalled = (record: Tracked): RetirableRuntime<Tracked> => {
-            const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
+            const installed = installApplicationRuntime({
+              openStore: fakeBrowserStorage,
+              isLive: () => slot.snapshot().status === 'live',
+            });
             record.acquisitions += 1;
             record.probeRevoked = () => {
+              try {
+                installed.services.remembered.ganttDetail.read();
+                return false;
+              } catch (error) {
+                return error instanceof Error && error.message.includes('revoked');
+              }
+            };
+            record.probeReadFails = () => {
               try {
                 installed.services.remembered.ganttDetail.read();
                 return false;
@@ -259,6 +339,15 @@ describe('the ownership rule, under generated interleavings', () => {
                   world.maxConcurrentDisposals,
                   world.disposing,
                 );
+                // 050-7-d, watched continuously rather than only once the run has
+                // drained: `close()` is only ever reached for a runtime `accept()`
+                // has already withdrawn, and `ensureLive` must already refuse a
+                // read here — before this disposal's own `installed.close` has even
+                // been scheduled, let alone settled.
+                expect(
+                  record.probeReadFails?.(),
+                  `${record.name}: a read succeeded, or threw before ensureLive could, at the instant its own disposal began`,
+                ).toBe(true);
                 try {
                   await scheduler.schedule(Promise.resolve(), `dispose ${record.name}`);
                   await installed.close(options);
@@ -354,6 +443,13 @@ describe('the ownership rule, under generated interleavings', () => {
           };

           for (const command of commands) {
+            if (command.kind === 'replace' || command.kind === 'retire') {
+              // 050-7-d: recorded *before* `accept()` runs (synchronously,
+              // within this same command), so it reflects what this specific
+              // request actually withdrew, not what some later command left
+              // behind.
+              if (slot.snapshot().status === 'live') liveRetirements += 1;
+            }
             if (command.kind === 'replace') {
               issueReplace(command);
             } else if (command.kind === 'retire') {
@@ -375,6 +471,20 @@ describe('the ownership rule, under generated interleavings', () => {
               );
             } else if (scheduler.count() > 0) {
               await scheduler.waitNext(1);
+            } else {
+              // 050-7-d (review 2, Critical 2): without this branch, a
+              // `settle` command was a no-op whenever nothing had reached the
+              // scheduler yet — which is always true for the very first
+              // construction on an empty slot, since `Acquire<S>` is
+              // synchronous and only *disposal* ever touches the scheduler.
+              // A plain microtask flush is enough: `disposeWithdrawn()`'s own
+              // no-op path (nothing withdrawn) resolves on one microtask, and
+              // everything after it in `transition()` — the fence check, the
+              // synchronous build, the `live` publish — runs to completion
+              // without needing another await at all. This is what lets a
+              // `replace` command actually reach `live` before a later
+              // command in the same generated sequence supersedes it.
+              await Promise.resolve();
             }
           }

@@ -391,6 +501,8 @@ describe('the ownership rule, under generated interleavings', () => {
           //    installed runtime's store followed its own graph.
           world.ownershipIsAccountedFor(live);
           world.storesFollowTheirGraphs(live);
+          // 2a. 050-7-d: nothing but the live runtime ever answers a read.
+          world.neverSilentlyReadsPastLive(live);
           // 3. Disposals never overlap: that is what the queue is for.
           expect(world.maxConcurrentDisposals, 'two disposals overlapped').toBeLessThanOrEqual(1);
           // 4. A request that was already superseded when its factory ran never
@@ -419,5 +531,38 @@ describe('the ownership rule, under generated interleavings', () => {
       ),
       { seed: 20260923, numRuns: 300 },
     );
+    // 050-7-d (review 2, Critical 2): the pinned run must actually have
+    // exercised what this packet's own invariants are about — retiring or
+    // replacing a runtime that was genuinely live, at least once, across the
+    // 300 generated sequences.
+    expect(
+      liveRetirements,
+      'the pinned run never retired or replaced a live runtime',
+    ).toBeGreaterThan(0);
   }, 120_000);
+
+  /**
+   * The deterministic case the generated property's own randomness cannot be
+   * relied on to hit in any one reading: build, reach `live`, retire it,
+   * await full settlement — and confirm the captured handle refuses
+   * afterward. Not a substitute for the property (this is one fixed
+   * ordering, not generated interleavings); a companion to it.
+   */
+  it('acquire, then retire a live runtime, then settled: the captured handle refuses afterward', async () => {
+    const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);
+    const isLive = (): boolean => slot.snapshot().status === 'live';
+
+    const services = await slot.replace(() =>
+      installApplicationRuntime({ openStore: fakeBrowserStorage, isLive }),
+    );
+    expect(slot.snapshot().status).toBe('live');
+    expect(services.remembered.ganttDetail.read()).toBeNull();
+
+    await slot.retire();
+
+    expect(slot.snapshot().status).toBe('empty');
+    expect(() => services.remembered.ganttDetail.read()).toThrow(
+      'the page withdrew this preference store before the access completed',
+    );
+  });
 });

```

## 8. Mutations rehearsed against the finished slice 2 tree

Every mutation was applied alone to the finished, green tree; typechecked (`tsc --build --force`,
exit 0 every time — every mutant is type-correct); run; and restored (`git diff` against the
pre-mutation tree empty after each restore) before the next. **Seventeen distinct mutation sites**,
regenerated from the final listings in this response (review 3, Important 2), across three
production files: fifteen in `preferences.resource.ts` (section 8.1), one in `module.ts` (8.2), and
one in `application-runtime.ts` (8.4). **Eighteen proof entries** in total (review 4, Important 2):
section 8.3 rehearses no new site of its own — it is section 8.1's own row 2 (the disabled-enforcement
edit to `preferences.resource.ts`) exercised a second time, against the extended
`lifetime-slot.model.test.ts` property rather than against `preferences.resource.test.ts` and
`application-runtime.test.ts`, so it adds an eighteenth observation without an eighteenth site.

### 8.1 `preferences.resource.ts` — fifteen mutations against the file's own twelve new tests

Rows 1-2 are the two broad, mechanism-wide mutations. Rows 3-12 each remove one of the ten distinct
`ensureLive()` call sites the finished file contains, and each fails exactly one example (or, for
rows 5-7, the example plus a second dependent observation — row 5's own absent-key example, rows 6/7's
own shared property) and no other — no grouped mutation stands in for an
individual site's own proof anywhere in this inventory. Rows 13-15 are a different kind of fault:
`ensureLive()` still runs and still throws, but **after** `storage.read(key)` rather than before it —
the guard is relocated, not removed. The named-example and thrown-message assertions on their own
cannot tell these two faults apart; only the recording adapter's own `reads()` log (section 7.2) can,
which is exactly what Important 4 (review 2) asked this inventory to cover explicitly.

| #   | Site removed/changed                                                                                        | Observed (`preferences.resource.test.ts`, 22 tests)                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Invert `ensureLive`'s own condition (`if (isLive()) throw …`)                                               | **17 failed \| 5 passed** in this file; combined with `module.test.ts` (2 failed/6 passed) and `application-runtime.test.ts` (8 failed/6 passed): **27 failed \| 17 passed (44)**.                                                                                                                |
| 2   | Disable enforcement, keep the two-argument signature (`const ensureLive = (): void => { void isLive(); };`) | **12 failed \| 10 passed** in this file; combined with `application-runtime.test.ts` (4 failed/10 passed): **16 failed \| 20 passed (36)**. `module.test.ts` unaffected (8/8 still passing). This is the mutation Critical 1 requires.                                                            |
| 3   | `storeOver`'s shared write pre-check                                                                        | **1 failed \| 21 passed** — `'a write refuses, and never reaches the store'` (uses `unchecked`, whose write has no second check of its own to mask the removal).                                                                                                                                  |
| 4   | `storeOver`'s shared forget pre-check                                                                       | **1 failed \| 21 passed** — `'a forget refuses, and never reaches the store'`.                                                                                                                                                                                                                    |
| 5   | `json` claim thunk's pre-check                                                                              | **2 failed \| 20 passed** — `'a JSON read refuses before the store, or the validator, is ever reached'` **and** `'a JSON read of an absent key still never reaches the store once withdrawn'` (the absent-key case never reaches `isValid` either, so it depends on this same, single pre-check). |
| 6   | `json`'s refuse-branch post-check                                                                           | **2 failed \| 20 passed** — the JSON-refusing example, and the property (shrunk `["refuse","read",true]`).                                                                                                                                                                                        |
| 7   | `json`'s accept-branch post-check                                                                           | **2 failed \| 20 passed** — the JSON-accepting example, and the property (shrunk `["accept","read",true]`).                                                                                                                                                                                       |
| 8   | `json`'s write-side post-serialization check                                                                | **1 failed \| 21 passed** — `'a value whose toJSON withdraws the runtime is never written'`.                                                                                                                                                                                                      |
| 9   | `text` claim thunk's pre-check                                                                              | **1 failed \| 21 passed** — `'a bare-text read refuses before the store, or the validator, is ever reached'`.                                                                                                                                                                                     |
| 10  | `text`'s refuse-branch post-check                                                                           | **1 failed \| 21 passed** — `'bare text, refusing: the refusal itself still refuses for withdrawal, and the key survives'`.                                                                                                                                                                       |
| 11  | `text`'s accept-branch post-check                                                                           | **1 failed \| 21 passed** — `'bare text, accepting: the accepted value is not returned'`.                                                                                                                                                                                                         |
| 12  | `unchecked` claim thunk's pre-check                                                                         | **1 failed \| 21 passed** — `'an unchecked read refuses before the store is ever reached'`.                                                                                                                                                                                                       |
| 13  | `json`'s pre-check **relocated** to after `storage.read(key)` (guard kept, order broken)                    | **2 failed \| 20 passed** — the same two examples as row 5 (`'a JSON read refuses…'`, `'a JSON read of an absent key…'`), both now failing on `expect(recordingStore.reads()).toEqual([])` rather than on the thrown message, which still fires.                                                  |
| 14  | `text`'s pre-check **relocated** to after `storage.read(key)`                                               | **1 failed \| 21 passed** — `'a bare-text read refuses before the store, or the validator, is ever reached'`, failing on `recordingStore.reads()` the same way.                                                                                                                                   |
| 15  | `unchecked`'s pre-check **relocated** to after `storage.read(key)`                                          | **1 failed \| 21 passed** — `'an unchecked read refuses before the store is ever reached'`, failing on `recordingStore.reads()` the same way.                                                                                                                                                     |

### 8.2 `module.ts` — the resolution-order mutation (supplied, not merely described)

Swapping the destructured parameter order in the `preferences` factory
(`{ isLive, preferencesStore }` instead of `{ preferencesStore, isLive }`) changes DI Bag's own
resolution order: `module.test.ts`'s `'names itself when a host omits the browser store'` example
fails with a **different** message than the one it asserts:

```text
Expected: "Cannot resolve "frontend.preferences/preferencesStore": dependency "browserStore" is not registered. …"
Received: "DI_BAG_MISSING_DEPENDENCY: Cannot resolve "preferences": dependency "isLive" is not registered. …"
```

`1 failed | 7 passed (8)`. `tsc --build --force`: exit 0.

### 8.3 `preferences.resource.ts`'s row-2 mutation, over a real slot — the generated counterexample, with the fixed loop

This section's own mutation site is `preferences.resource.ts` — the same disabled-enforcement edit as
section 8.1's own row 2, not a site of its own in `lifetime-slot.model.test.ts` (review 4, Important 2).
What differs is only which test observes it: here, the extended `lifetime-slot.model.test.ts` property
and its new deterministic example, run over a real slot rather than the fakes section 8.1 uses.

`liveRetirements` observed fresh in this rehearsal, on the finished (green) tree: **14** across the
300 pinned runs (`toBeGreaterThan(0)` passes with margin). The mutation used here is the
**signature-preserving** one Critical 1 requires (row 2 of section 8.1:
`const ensureLive = (): void => { void isLive(); };`), which keeps `createPreferences`'s full
two-argument signature and typechecks cleanly — removing the second parameter instead does not
compile at all (fourteen distinct `Expected 1 arguments, but got 2` diagnostics: `module.ts:67` plus
thirteen call sites in the test files now passing two arguments; section 3.4 records why an earlier
draft used that mutation by mistake). With the signature-preserving mutation applied, the extended
property fails:

```text
Error: Property failed after 27 tests
{ seed: 20260923, path: "26:0:0", endOnFailure: true }
Counterexample: [schedulerFor()``,[{"kind":"retire"},{"kind":"replace","disposal":"settles","partial":false,"reentry":"factory","graph":"installed"}]]
Shrunk 2 time(s)

AssertionError: r2 is not live (live=null) but its read did not throw: expected false to be true
  ❯ Ownership.neverSilentlyReadsPastLive
```

and the new deterministic example fails too, on the same mutation:

```text
AssertionError: expected [Function] to throw error including 'the page withdrew this preference sto…' but got 'the preferences store was revoked wit…'
```

Both are the exact same shrunk counterexample and the exact same failure this section's own earlier,
invalid draft reported — the observations were always genuine; only the mutation used to produce them
is corrected. `tsc --build --force`: exit 0 (the signature-preserving mutant is fully type-correct;
`isLive` remains declared and referenced, just never consulted). Restored; both tests re-run green
afterward (`2 passed (2)`).

### 8.4 `application-runtime.ts`'s own production predicate

`acquireApplicationRuntime`'s own `isLive: () => applicationSlot.snapshot().status === 'live'`
replaced with `isLive: () => true`, `application-runtime.test.ts` run two ways:

- Through the true node-tier command (`(cd apps/wbs/fe-01 && … --config vitest.node.config.ts …)`,
  matching what `vitest.node-suites.ts` actually selects this file for): the named example fails with
  `AssertionError: expected [Function] to throw error including 'the page withdrew this preference
sto…' but got 'localStorage is not defined'` — the write reached the real adapter and threw for an
  unrelated, environment reason instead of the expected one.
- Through the default (DOM-having) config, which is what this packet's own owned-path rehearsal
  command also uses: the named example fails with `AssertionError: expected [Function] to throw an
error` — the write silently succeeded (a DOM was present to receive it), so no exception was thrown
  at all.

Both are genuine, distinct failures of the one named test — `'refuses a captured reference through
the production singleton once withdrawal is accepted'`. `tsc --build --force`: exit 0. Restored;
`application-runtime.test.ts` re-run green afterward (`14 passed (14)`).

**Explicitly not claimed:** mutating the `'lets a stale reference from a REPLACED runtime reach
REVOKED…'` test's own local `isLive` to `() => true` (review 2, Important 2) — its own store was
already revoked before the newer runtime went live, so that test's own assertion (`REVOKED`) is
unaffected by what `isLive` answers. This mutation is not in the inventory.

## 9. `verify.md` sections and `tasks.md`'s own appended sentence

**Slice 1's own `verify.md` section** records: the design-record appendix's own content (section
7.1, appended verbatim, no code path touched); the empty `git diff --stat` against `lifetime-slot.ts`
and `lifetime-slot.model.test.ts`; Prettier `--write` then `--check`, both files, exit 0 both times.

**Slice 2's own `verify.md` section** records: the exact red state, on the unchanged tree, for all
four files step 2a touches (`preferences.resource.test.ts` `12 failed | 10 passed (22)`,
`application-runtime.test.ts` `4 failed | 10 passed (14)`, `lifetime-slot.model.test.ts` `2 failed | 0
passed (2)`, `module.test.ts` unaffected at `8 passed (8)`, combined `18 failed | 28 passed (46)`, all
additions present at once — review 4, Important 2); the green counts (section 3.5's own table); the
full, eighteen-entry mutation inventory over seventeen distinct sites (section 8); the two lint
autofixes.

**Slice 3's own `verify.md` section** records: the strict OpenSpec block's own fresh output
(`114`/`114`/`0`, unchanged from step 0's own pre-change baseline); the planner-only matrix (section
6, slice 3) with `tool-devsync:test`, `wbs-fe-01:build` and `wbs-fe-01:test:unit` all freshly green
against fresh baselines, and `wbs-fe-01:test` explicitly recorded as **not completed** inside this
rehearsal's own time allowance rather than silently skipped or assumed; the host gate named as
planner-only, not run here. This section references slice 1's and slice 2's own already-committed
sections and records no new mutation observation of its own (review 2, Important 5).

**`tasks.md`'s own appended sentence**, immediately under task 4's existing "Follow-up for 050-7-d"
paragraph, same indentation:

```text
Closed by 050-7-d's part 1 (`preferences.resource.ts`'s `ensureLive`, fed by a
synchronous `isLive` predicate over the existing `LifetimeSlot.snapshot()`; no
change to `lifetime-slot.ts`) — see
`docs/superpowers/plans/2026-09-21-batch-6/050-7-d-withdrawal-and-page-lifecycle.md`.
```

## 10. Stop conditions

None of these were true on this packet's own starting tree
(`ff751c936881eaff93b05cb7f6ee77665352edea`), checked against each slice's own recorded starting
inventory, never an absolute number carried forward from an earlier round.

- `git diff --stat apps/wbs/fe-01/src/runtime/lifetime-slot.ts` is non-empty at any slice's own
  hand-over. (False at every slice in this rehearsal — the model **test** file is touched, the
  production file is not, per section 4.5's own authorization.)
- `(cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences/preferences.resource.test.ts)`
  exits non-zero, or reports fewer than `22` tests, once slice 2 is complete. (False: exit 0, `22
passed (22)`.)
- `wbs-fe-01:typecheck` (or the forced `tsc --build`), `wbs-fe-01:lint`, or `nx format:check --all`
  exits non-zero on the tree as committed. (False for all three.)
- The sandbox unit command's own file or test count, checked against **that slice's own** captured
  step-0 baseline, falls outside the row below. (False at every slice in this rehearsal — each cell
  holds exactly.)

  | Slice | Files delta (from that slice's own step-0 baseline) | Tests delta (from that slice's own step-0 baseline) |
  | ----- | --------------------------------------------------- | --------------------------------------------------- |
  | 1     | `0`                                                 | `0`                                                 |
  | 2     | `0`                                                 | `+18`                                               |
  | 3     | `0`                                                 | `0`                                                 |

  Slices 1 and 3 touch no test files at all (section 5's own file plan), so their own step-0 baseline
  is also their own end-of-slice count; only slice 2 adds anything, and only once (review 4, Critical 1
  — a single condition applied to "the step-0 baseline" without saying whose was impossible to satisfy
  at slice 3, which starts from slice 2's already-larger baseline, not slice 1's).

- The README's strict OpenSpec block's `jq` predicate exits non-zero, or its `passed`/`items` figure
  changes from this packet's own step-0 baseline. (False: `114`/`114`/`0`, unchanged.)
- The pinned model-test property completes 300 runs with `liveRetirements === 0`. (False: `14`.)
- Any mutation in section 8 leaves its named test(s) passing, or fails to typecheck. (False: each
  fails exactly the named test(s), and every mutant is type-correct.)

## 11. What this packet leaves, in dependency order

1. **050-7-e, the page-lifecycle trigger (task 5)** — `pagehide` (persisted or not) retires the
   runtime through the slot; hot-module-replacement of the bootstrap module retires then replaces;
   `pageshow` with `persisted` joins the pending retirement before rebuilding (map test 3, including
   its own rejection/budget-expiry variants that render the sanitized fatal state); the general
   application-disposal-failure case (map test 4) also applies once this trigger exists. Section 1
   states the slice count that requires this cut. 050-7-e's own design is unconstrained by anything in
   this packet beyond section 4: `lifetime-slot.ts` is untouched, and the withdrawal outcome this
   packet proves — a captured reference refuses the instant `accept()` runs — is exactly the
   guarantee a `pagehide` handler needs from the slot it calls `retire()` on.
2. **The five call sites, `modules/preferences/composition.ts`'s deletion, OpenSpec task 12's K2
   debt disposition** — unchanged from packet c's own section 11 item 2.
3. **050-7-j, the boundary checks and module indexes** (tasks 12 and 13) — unchanged from packet c's
   own section 11 item 3.
4. **050-7-f through 050-7-i** — the session and project runtimes, and log out — unchanged in
   substance from packet c's own section 11 ordering; only the letter shifts because this packet
   claimed `050-7-d`.
5. **`wbs-fe-01:test`'s own whole-tier planner run** — attempted in this rehearsal and not completed
   inside the time available (section 6, slice 3); the planner's own real dispatch should allow this
   target a longer budget than 400 seconds, matching its own observed `6m44s`-and-still-running
   duration.

## 12. Assumptions recorded rather than asked

- **`neverSilentlyReadsPastLive`, checked only once at full drain, is not by itself sufficient
  proof — the continuous, in-`close()` check is what actually catches the regression** (section
  8.3's own counterexample surfaces through the final check because the in-`close()` assertion's own
  throw is caught and re-interpreted by `lifetime-slot.ts`'s own `disposeWithdrawn` as a disposal
  failure, which is itself a legitimate, if indirect, proof chain — recorded rather than smoothed
  over, because `buildInstalled`'s own graph never rejects or hangs, so by full-drain time a fully
  disposed installed runtime's store is always `REVOKED` regardless of whether `WITHDRAWN` ever fired
  first).
- **`liveRetirements` accumulates across the whole pinned run rather than being asserted per
  iteration.** A per-iteration assertion would fail every run that happens not to reach `live` before
  its own commands run out, which is a legitimate outcome for a short generated sequence, not a
  defect; asserting across all 300 runs is what proves the _pinned seed's own coverage_, which is the
  claim this packet actually needs.
- **`IsRuntimeLive` is threaded as an explicit dependency, not inferred from `RevocableBrowserStorage`
  gaining a synchronous accessor.** A synchronous "is-revoked" flag on `revocableStorage` itself would
  need something to flip it at `accept()` time, which is exactly the source-level callback mechanism
  packet c's own review 4 found broken; reading the already-public, already-synchronous
  `LifetimeSlot.snapshot()` from the composition root avoids inventing any new slot-side state.
- **The `WITHDRAWN`-vs-`REVOKED` precedence is stated as tracking the slot's own current state, with
  no "permanent" claim anywhere**, including in symbol JSDoc (`WITHDRAWN`'s own comment,
  `IsRuntimeLive`'s own comment) and test titles — section 4.4 and its four tests (section 7.3) are
  the correction to an earlier draft's overstated, inconsistently worded claim.
- **`wbs-fe-01:test`'s own whole-tier run is reported as not completed, not as passing.** A longer
  planner allowance is what closes this, not a claim this response cannot back with a finished run.

## 13. Disposition of review 1

| Finding                                                                                                     | Verdict                                              | Where                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — a refusing validator still reached `storage.forget`                                            | **FIXED**                                            | `ensureLive()` rechecked after **both** branches of `isValid` (section 4.2, section 7.2); example tests plus the property assert unchanged bytes on the refusing path; mutations 6/10 in section 8.1 prove each shape's refuse-branch check independently.                               |
| Critical 2 — slice 2a's prescribed red contradicted its own test additions                                  | **FIXED**                                            | Section 6, slice 2, states the single, exact combined red, rehearsed fresh each round; both test additions are added once, in one step.                                                                                                                                                  |
| Critical 3 — hand-over conditions omitted `verify.md` from slice 1 and demanded impossible per-slice deltas | **FIXED**                                            | Section 5's file plan lists `verify.md` against all three slices explicitly, including slice 1; section 3.5's own table states each slice's real delta.                                                                                                                                  |
| Important 1 — grouped mutations concealed a check with zero effective coverage                              | **FIXED**                                            | Section 8.1: eleven single-site mutations against `preferences.resource.ts` alone, each with its own named failing test.                                                                                                                                                                 |
| Important 2 — production liveness wiring excluded from executable verification                              | **FIXED**                                            | Section 7.3's own diff adds a dedicated example through `acquireApplicationRuntime` and the real `applicationSlot`, with explicit cleanup; section 8.4 mutates only that function's own predicate and shows the named test fail two distinct ways depending on which config observes it. |
| Important 3 — the mutation inventory and recorded totals were internally impossible                         | **PARTLY, then FIXED in review 2** — see section 14. |
| Important 4 — the generated property exercised a fake flag, not real lifecycle interleavings                | **PARTLY, then FIXED in review 2** — see section 14. |
| Important 5 — no planner verification matrix; uncollected OpenSpec baseline                                 | **PARTLY, then FIXED in review 2** — see section 14. |
| Important 6 — private review paths; the appendix not actually supplied                                      | **FIXED**                                            | Section 2's own reading list cites only repository-resident material; section 7.1 gives the appendix as one exact, standalone Markdown block.                                                                                                                                            |
| Important 7 — documented disposal ordering and refusal-message precedence disagreed with the code           | **PARTLY, then FIXED in review 2** — see section 14. |
| Minor 1 — the illustrative grep used the wrong path and no existence guard                                  | **FIXED**                                            | Section 6, slice 1, uses the full repository-relative path and gates it with `[ -s … ]`.                                                                                                                                                                                                 |
| Minor 2 — arithmetic and naming errors; slice count exceeding six                                           | **FIXED**                                            | `toggleableLiveness` renamed to `createLiveness`; this packet states one slice count throughout — three.                                                                                                                                                                                 |

## 14. Disposition of review 2

| Finding                                                                                                                                                 | Verdict                                                        | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — the required mutation (§8.3) did not typecheck                                                                                             | **FIXED, then found stale again by review 3 — see section 15** | Mutation 2 in section 8.1 keeps the two-argument signature and disables only the enforcement (`void isLive();`); typechecks (exit 0); fails the exact named tests. This response's own round left §8.3 itself still prescribing the non-typechecking mutation — corrected now, per section 15.                                                                                                                                                                                                                                                                       |
| Critical 2 — the pinned property never retired a live runtime; `storesFollowTheirGraphs` had a false invariant                                          | **FIXED**                                                      | Section 3.4, section 4.4, section 7.6. The command loop now yields via a plain microtask flush when nothing is scheduled yet; a `liveRetirements` counter, accumulated across the whole 300-run pinned property and asserted `> 0`, makes this a checked fact (observed: **14**, section 8.3). `storesFollowTheirGraphs` is scoped to `live !== null` with its own JSDoc explaining why; `neverSilentlyReadsPastLive`, unconditional on `live`, covers the excluded case. Both rehearsed fresh with a shrunk counterexample under the core regression (section 8.3). |
| Critical 3 — per-slice deltas restated inconsistently, implying slice 3 starts from the same absolute baseline as slices 1 and 2                        | **FIXED, then found stale again by review 3 — see section 15** | Section 3.5's own table states each slice's real delta once. This response's own round left section 6's step-0 text still stating one shared baseline for every slice's own step 0, when slice 3's own step 0 in fact runs after slice 2 is committed and sees slice 2's own green numbers instead — corrected now, per section 15.                                                                                                                                                                                                                                  |
| Important 1 — `JSON.stringify` can run a `toJSON` that retires the runtime                                                                              | **FIXED**                                                      | Section 3.2, section 4.2 item 2, section 7.2 (`json`'s write callback serializes first, then rechecks liveness, then writes; a dedicated `toJSON` example and its own independent mutation, section 8.1 row 8).                                                                                                                                                                                                                                                                                                                                                      |
| Important 2 — mutation inventory: `module.ts`'s resolution-order fault undelivered; the replacement-precedence mutation ineffective and wrongly claimed | **FIXED**                                                      | Section 8.2 supplies the resolution-order mutation with its own observed, different failure message. Section 8.4's own closing paragraph states plainly that the replacement-precedence mutation is **not** claimed, and why (that test's own assertion does not depend on what `isLive` answers once its own store is already revoked).                                                                                                                                                                                                                             |
| Important 3 — slice 2's Step 2a red checkpoint covered only `preferences.resource.test.ts`, not the runtime and model-test edits it also depends on     | **FIXED, then found stale again by review 3 — see section 15** | An earlier disposition of this round mislabelled the finding as a test-count discrepancy and addressed that instead. The real finding — restated by review 3 as its own Important 1 — is that Step 2a must add every test and fixture edit (resource, runtime, model-test, module fixture) before any production diff, with each file's own observed result against unchanged production code. Section 6's Step 2a is restructured for this, per section 15.                                                                                                         |
| Important 4 — read tests did not prove "never reaches the store"                                                                                        | **FIXED**                                                      | Section 4.3(c), section 7.2's own `recordingBrowserStorage`. Every pre-check example asserts `recordingStore.reads()` stays empty, including the absent-value case; each of the three shapes' own pre-checks now has its own formal guard-relocation mutation as well, not just a removal — section 8.1 rows 13-15 move the guard past `storage.read` instead of deleting it, and each still fails exactly the recording-based assertion, not the thrown message.                                                                                                    |
| Important 5 — no fresh baselines; unclear hand-over for slice 3                                                                                         | **FIXED**                                                      | Section 6's own step 0 now collects an OpenSpec baseline before any change (`114`/`114`/`0`), in addition to the node/owned baselines already collected. Section 6's slice 3 now states explicitly that it references only slice 1's and slice 2's own already-committed `verify.md` sections and records no new mutation observation of its own — no `--seed` is needed because no earlier attempt's evidence is consumed.                                                                                                                                          |
| Important 6 — precedence documentation promised permanence the slot does not provide                                                                    | **FIXED**                                                      | Section 4.4 rewritten around the slot's own **current** state; `WITHDRAWN`'s own JSDoc (section 7.2's diff) states plainly it is not the only message a caller can observe; every test title and comment using "permanently" or "before disposal ever runs" is removed (section 7.3's diff); the retire-then-later-replace case is tested directly (`'flips a retired reference from WITHDRAWN to REVOKED…'`, section 7.3).                                                                                                                                          |
| Minor 1 — the node-tier command shown without a working-directory wrapper                                                                               | **FIXED**                                                      | Section 3.3's own commands are wrapped in `(cd apps/wbs/fe-01 && …)` throughout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Minor 2 — remaining count and citation errors (example counts; map test 2 misattributed for failed-retirement rendering)                                | **FIXED**                                                      | Section 3.5's own table gives the exact, freshly rehearsed example counts per file. Section 1 and section 11 now cite map test 2 only for "shutdown is shared across page hide and HMR," map test 3 for "persisted restoration joins retirement" (including its own rejection/budget-expiry-renders-fatal variants), and map test 4 for the general disposal-failure case — read directly from `050-7-frontend-lifetime-map.md`'s own numbered list rather than assumed.                                                                                             |

## 15. Disposition of review 3

| Finding                                                                                                                                             | Verdict                                        | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — §8.3 still prescribed the non-typechecking mutation and falsely claimed `tsc` exits 0                                                  | **FIXED**                                      | Section 8.3 now names the signature-preserving mutant (row 2 of section 8.1) directly, states its own typecheck result (exit 0) and the diagnostic the removed-parameter mutant produces instead (fourteen distinct `Expected 1 arguments, but got 2` locations, rehearsed fresh: `module.ts:67` plus thirteen in `preferences.resource.test.ts`). Section 3.4 and section 8.1 row 2 carry the same corrected wording, with the three phrasings review 3 asked removed no longer appearing anywhere in the packet.                                                                                                                                                                                                                                                                                                                                                                                                            |
| Critical 2 — the baseline-count claim and its delta notation were repeated ambiguously across slices                                                | **PARTLY FIXED here, completed in section 16** | Section 6's own step-0 text was corrected to state slices 1 and 2 share one baseline while slice 3 sees slice 2's own larger one. This round's own disposition wrongly claimed that closed the finding: section 10's own stop condition still applied one "step-0 baseline plus eighteen" figure to every slice's own count without saying whose baseline, which review 4 caught as literally unsatisfiable at slice 3. Section 10 now carries an explicit per-slice table instead (section 16, Critical 1).                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Important 1 — Step 2a must add all test/fixture edits before any production diff, each with its own observed red result                             | **FIXED**                                      | Section 6's Slice 2 Step 2a now lists and runs all four edits (`preferences.resource.test.ts`, `application-runtime.test.ts`, `lifetime-slot.model.test.ts`, `module.test.ts`'s fixture) against unchanged production code, states each file's own observed result plus the combined `18 failed \| 28 passed (46)`, and notes compilation is deferred to Step 2b's own green checkpoint. Step 2b then applies only the four production diffs, naming `preferences.resource.ts` explicitly (Minor 3). Section 14's Important 3 row now states the real review-2 finding rather than the count-based substitute an earlier round wrote in its place.                                                                                                                                                                                                                                                                            |
| Important 2 — mutation inventory needed regenerating from final listings, plus three guard-relocation rows                                          | **FIXED**                                      | Section 8.1 is regenerated from a fresh rehearsal in this response: row 1 (invert) **27 failed \| 17 passed (44)**; row 2 (disable enforcement) **16 failed \| 20 passed (36)**, `module.test.ts` unaffected; row 5 (JSON pre-check removal) **2 failed**, naming both dependent tests. Three new rows (13-15) relocate the `json`/`text`/`unchecked` pre-checks past `storage.read` instead of removing them, each still typechecking and still failing only the recording-based assertion (`2 failed`, `1 failed`, `1 failed` respectively). The table now holds fifteen rows in this file. (This round's own count of "eighteen mutations across four files" conflated sites with proof entries — corrected in section 16, Important 2, to seventeen sites across three production files and eighteen proof entries.) Rows 3 and 5 are reconciled with section 14's Important 4 row, which now cites rows 13-15 by number. |
| Important 3 — planner baseline commands must run before implementation, with the strict OpenSpec predicate applied there too, not cited to packet c | **FIXED**                                      | Section 6 now opens with a planner-only block, before slice 1, that runs `tool-devsync:test`, `wbs-fe-01:build`, `wbs-fe-01:test:unit` and the strict OpenSpec `jq` predicate on the unchanged tree, recording `366 pass / 0 fail`, exit 0, `48 files / 676 tests`, and `114`/`114`/`0` respectively — all rehearsed fresh in this response. Slice 3's own planner-only block now compares against these captured figures instead of "packet c's own last rehearsal."                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Minor 1-2 — the JSON writer's anchor line, and the wrong DI Bag error code in both JSDoc comments                                                   | **FIXED**                                      | Section 2 and section 3.2 cite `preferences.resource.ts:73` (verified against `ff751c93` directly). `contract.ts`'s `PreferencesRequirements` JSDoc and `preferences.resource.ts`'s `createPreferences` JSDoc (section 7.2's and 7.3's own diffs) both now state the observed `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "preferences": dependency "isLive" is not registered.`, rehearsed fresh against the module resolution-order mutation (section 8.2), and explain the distinct case `DI_BAG_MISSING_REGISTRATION` still covers.                                                                                                                                                                                                                                                                                                                                                                                        |

Only this packet's own plan document differs from `ff751c936881eaff93b05cb7f6ee77665352edea` in the
committed tree; every code file rehearsed above was restored byte-for-byte before this section's own
commit.

## 16. Disposition of review 4

| Finding                                                                                                                                                                                    | Verdict   | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — §10's count stop condition applied one baseline to every slice, impossible to satisfy at slice 3                                                                              | **FIXED** | Section 10's own stop condition is now an explicit per-slice table — slice 1 `0`/`0`, slice 2 `0`/`+18`, slice 3 `0`/`0` — each checked against that slice's own captured step-0 baseline, not one shared figure. Section 15's own Critical 2 row, which wrongly claimed this was already closed, is corrected to point here.                                                                                                                                                                                                                                                                                                                                                                                           |
| Important 1 — Step 0's OpenSpec check accepted exit status alone; the whole `wbs-fe-01:test` target had no baseline                                                                        | **FIXED** | Step 0's own OpenSpec check now runs the same strict `jq` predicate the planner-only blocks use, not exit status alone. Section 6 now runs `wbs-fe-01:test` (UTC over the default config, then Auckland over `vitest.zoned.config.ts`) in the pre-implementation planner-only block too, with the required comparison stated explicitly: unchanged file counts, eighteen more UTC tests, unchanged Auckland counts. Both this baseline attempt and slice 3's own after-run did not finish inside this response's own allowance (the target is already recorded elsewhere in this packet as running past 6m44s single-threaded); both rows are recorded as pending planner verification rather than claimed as compared. |
| Important 2 — mutation sites conflated with proof entries; §8.3's own site misattributed to a test file                                                                                    | **FIXED** | Section 8's own intro, section 6's own "mutation" paragraph, and section 8.3's own heading now state seventeen distinct mutation sites across three production files (`preferences.resource.ts`, `module.ts`, `application-runtime.ts`) and eighteen proof entries — section 8.3 reuses section 8.1's own row 2 against the model property rather than mutating `lifetime-slot.model.test.ts` itself. Section 9's slice-2 entry now records all four files' own red results, not `preferences.resource.test.ts` alone.                                                                                                                                                                                                  |
| Minor 1 — Step 2b pointed the resource diff at the wrong section                                                                                                                           | **FIXED** | Step 2b now reads: "Apply the `preferences.resource.ts` production diff in section 7.2, then the `contract.ts`, `module.ts` and `application-runtime.ts` production diffs in section 7.3."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Minor 2 — stale references: §3.5's three-file total called `preferences.resource.test.ts` "alone"; §4.2 cited §8.4 for the resolution-order rehearsal; §8.1's exception list omitted row 5 | **FIXED** | Section 3.5 now labels `44` the three-file total and states `preferences.resource.test.ts` holds `22` on its own. Section 4.2 item 3 now cites section 8.2. Section 8.1's own intro now excepts rows 5-7, not only 6-7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Only this packet's own plan document differs from `ff751c936881eaff93b05cb7f6ee77665352edea` in the
committed tree; every code file rehearsed above was restored byte-for-byte before this section's own
commit.
