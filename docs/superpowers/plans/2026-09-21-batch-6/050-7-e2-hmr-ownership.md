# 050.7 e2 — hot module replacement: held

|             |                                                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **sixth packet, held**                                                                                     |
| Size class  | — a documentation record; no code, no test, no config change; no executor slice                                                                                                                       |
| Predecessor | [050.7e](050-7-e-page-lifecycle.md), merged at `e9b7f83b`: page-hide/persisted-restoration retirement, root invalidation, the report/draw split, and section 11's hand-over naming three races        |
| Status      | **Held.** In-document hot-module replacement of the bootstrap module is deferred. Task 5 stays unchecked. This record is committed by the planner as documentation; nothing is dispatched (section 9) |

## Revision note (round 4: held, not cut to "done")

Round 3 cut the ownership-record mechanism and proposed treating Vite's own default full-reload
behaviour as satisfying the same obligation. Round 4's review (`050-7-e2-hmr-ownership.review4.md`)
found that claim wrong: a full reload does not pass the retirement gate `openspec/changes/
adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` requires (section 3). Task 5 cannot be
ticked and this cannot be called "HMR is done." This response holds the packet as a record of the
current, verified state and the open decision, rather than closing an obligation it cannot show met.

## 1. Status

**In-document hot-module replacement of `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx` is
DEFERRED.** Today, editing that module (or `main.tsx`, or anything upstream of it with no accepting
boundary of its own) triggers a full page reload — Vite's own default when no module in the chain from
the edit to the page's own HTML entry registers `import.meta.hot.accept` (section 3.1). That reload
initiates retirement through the real `pagehide` event **on a best-effort basis only**: it does not
wait for retirement to complete, does not observe whether it succeeded or failed, and does not preserve
a terminal refusal across the navigation — the new document's own fresh bootstrap runs regardless of
how the old document's retirement ended (section 3).

**Task 5 (`openspec/changes/adopt-frontend-lifetimes/tasks.md`) stays UNCHECKED.** Closing it requires
one of two things, neither decided by this packet:

1. **A gated in-document replacement** — an actual mechanism that awaits retirement and refuses
   replacement on failure or timeout, the way `openspec/changes/adopt-frontend-lifetimes/specs/
adopt-frontend-lifetimes/spec.md`'s own "A failed or expired retirement refuses the replacement"
   requirement already demands for every other transition in this codebase. The three races and two
   abandoned mechanisms three prior rounds reproduced (sections 4.1–4.2) are recorded here as this
   mechanism's own adversarial history, for whoever attempts it next.
2. **An amendment** to the existing OpenSpec change and the lifetime map, explicitly distinguishing
   **document replacement** (today's real behaviour: a full reload, best-effort, no completion proof)
   from **gated in-document replacement** (what the map's own "Vite HMR disposal uses the same
   terminal retirement gate" sentence currently promises), stating the former's limits plainly, and
   validating that amendment before any packet claims the obligation closed under it.

Choosing between these is a decision for the planner or Dany, not something this packet decides or
implements.

## 2. Read first

1. `LLM_README.md`, then its link for this task.
2. [050.7e](050-7-e-page-lifecycle.md) section 1 (the HMR cut) and section 11 (the hand-over).
3. `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx`, as 050.7e left it — unchanged by this
   packet.
4. `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, the "Application owner"
   section (section 3 below quotes its own load-bearing sentences).
5. `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`, "A failed or
   expired retirement refuses the replacement" (lines 57–64).
6. `openspec/changes/adopt-frontend-lifetimes/tasks.md` task 5, `verify.md`'s own packet-050.7e
   section.

## 3. Why full reload does not close this obligation

**The map's own text distinguishes best-effort initiation from proved completion, and says HMR needs
the latter.** `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, "Application
owner" (verified this response): "Since a browser lifecycle event cannot be relied on to await a
promise, `pagehide` provides best-effort initiation rather than proof of completion; controlled tests
await the coordinator promise," immediately preceded by "Vite HMR disposal uses the same terminal
retirement gate before the replacement module performs ordinary bootstrap." The second sentence commits
to a **gate** — HMR disposal is meant to be held against the same terminal check every other transition
in this codebase passes through, not merely to _initiate_ retirement and move on regardless.

**The spec requires exactly that gate, in terms nothing about a full reload can satisfy.**
`openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md:57-64`, "A failed or
expired retirement refuses the replacement": "When a required retirement rejects, or its bounded wait
expires, the runtime owner SHALL refuse the transition: it SHALL NOT build or publish the
replacement... its eventual completion SHALL NOT publish the refused replacement." A full reload has no
way to refuse anything: the new document's own fresh `bootstrapApplication` call runs unconditionally,
whether the old document's retirement settled, rejected, or was still running when the navigation tore
its JS realm down.

### 3.1 Vite's own default: an unaccepted update is a full reload, verified this response

No `import.meta.hot.accept` is registered anywhere in the chain from `application-bootstrap.tsx` to the page's own HTML entry (`main.tsx` registers none either). Vite's own dependency-graph propagation (`node_modules/vite/dist/node/chunks/node.js`, `propagateUpdate`) climbs from the edited module up through every importer looking for a self-accepting boundary; reaching a module with no importers and no acceptance returns a "dead end" (`:27224`, `else if (!node.importers.size) return true;` — re-verified this response with `grep -n`, not the `:27222` an earlier round cited, which is `isWithinCircularImport`), which `updateModules` (`:27143`, `let needFullReload = modules.length === 0;`; `:27149`, `if (hasDeadEnd) { needFullReload = hasDeadEnd; ... }`) turns into `hot.send({ type: 'full-reload', ... })` (`:27175`) — the client-side handler for which is an ordinary `location.reload()` of the current page.

### 3.2 `onPageHide` does not await retirement — verified against the landed code, this response

`application-bootstrap.tsx:316-321`:

```ts
const onPageHide = (): void => {
  invalidateRoot();
  startRetirement();
};
```

`startRetirement` (`:303-312`) is itself `(): void =>` — it calls `dependencies.slot.retire()` (a
`Promise`) and attaches only a `.catch()`, never an `await`. `onPageHide` returns synchronously,
before `retire()`'s own async disposal work has done anything. `lifetime-slot.ts:300`,
`disposeWithdrawn`, is where that work actually `await`s a real close — `await disposing.close({
timeoutMs: budgetMs })` — but **nothing connects that promise's own eventual outcome to Vite's reload,
or to the new document's own bootstrap.** For an ordinary `pagehide` (the user closes the tab, follows
a link), this is the map's own accepted best-effort design: the page is leaving regardless, and nothing
in the browser lets a `pagehide` handler block that. For an **HMR-triggered** reload, the map's own text
(above) says this was supposed to be different — gated, not best-effort — and it is not, because there
is no code anywhere that makes it different. A full reload runs through the exact same, ungated
`onPageHide` path an ordinary navigation does.

**A new document does avoid competing instances racing in one JS realm** — the three races in section
4.1 genuinely cannot happen under a full reload, because there is never a second `bootstrapApplication`
instance alive at the same time as the first. That is real and worth recording (it is why full reload
looked, at first, like it might be sufficient). It does not, on its own, prove the _old_ document's
retirement ever completed, prove any resource it held was actually released, or preserve a terminal
refusal across the navigation — three separate guarantees the spec's own "refuses the replacement"
requirement asks for, none of which "no second instance exists" implies.

### 3.3 Historical observation (not evidence this packet relies on for the obligation above)

An earlier round of this packet ran a real dev-server/browser probe (not carried forward here — see the
note below) that observed: an HMR-triggered edit produced a real navigation, and `#root` was observed
emptied before that navigation completed. **That observation is real, but proves less than it was
earlier read to prove.** Round 4's own review replayed the actual bootstrap and slot in-memory and
found: `invalidateRoot()` runs **before** `startRetirement()` inside `onPageHide` (section 3.2,
unconditionally, every time) — so `#root` empties whether or not retirement ever starts successfully.
With `startRetirement()` removed entirely from a copy of the function, the same replay still produced
`unmounts=1`, but `closeCalls=0` and slot status `live` — retirement never began, and the root still
emptied. Root-emptiness is evidence of `invalidateRoot()` running, which it always does on `pagehide`
by construction; it is not evidence retirement started, continued, or completed, and this packet does
not claim otherwise. The probe script itself is not reproduced in this revision (section 5) — its own
claims were narrower than how the previous round's packet text used them, and re-deriving a
provably-correct replacement was judged not worth the risk of a fifth review round finding a fifth
shape of the same problem, for a script whose own strongest possible claim ("navigation happened, and
`#root` was observed empty at some point around it") adds nothing beyond what section 3.2's own direct
source reading already establishes with a citation instead of a browser.

## 4. Adversarial history — races and abandoned mechanisms, for whichever future attempt closes this

### 4.1 The three races, exactly as 050.7e's own hand-over stated them

1. **Bootstrap → HMR → replacement bootstrap → the old instance's own pending retirement fails.**
   Round 1's own finding: two roots, two reports.
2. **Bootstrap → pagehide → queued persisted pageshow → HMR → replacement bootstrap → the pagehide's
   own retirement rejects.** Round 2's own finding: `lifetime-slot.ts` checks terminal refusal before
   its own ordinal fence, so the raw refusal reaches an already-superseded instance's own `catch`
   rather than `TransitionSupersededError`.
3. **Bootstrap → HMR → disposal rejection → failure displayed → successor bootstrap.** Round 3's own
   finding, in that exact order: the old instance's own retirement fails and its fatal page is already
   showing before any successor exists, and only then does a successor bootstrap.

Each requires a second `bootstrapApplication` instance racing the first's own in-flight continuations
in one JS realm — unreachable under today's full-reload behaviour, but squarely reachable again by any
future **in-document** replacement mechanism, which is why these stay recorded as its adversarial cases
rather than being deleted now that the mechanism itself is not being built this round.

### 4.2 The two mechanisms already tried, and why each leaked

- **`unsubscribe()` on the slot, plus removing two page listeners.** Fixed _subsequent_ slot
  notifications for the disposed instance, but did nothing about that instance's own already
  in-flight promise continuations — `attempt()`'s own `catch` and `startRetirement()`'s own `catch`
  are direct promise chains, not slot subscriptions, and neither was gated.
- **A bootstrap-generation ownership token, shared `hot.data` state, and a second `isCurrent()`
  fence.** Survived two internal review rounds, then a third found: a false behavioral red depending
  on the ownership record's own default rather than a real race; a reference-model test whose commands
  could advance the model's own tracked generation without any corresponding change in the real
  system; deleted regression coverage; and a browser negative whose own sabotage deleted the exact
  marker its own assertions were waiting to observe.

## 5. No browser probe in this revision

Round 3's own browser probe is not carried forward. It observed real behaviour, but under the claim
this revision makes (section 3.3), it would add reproducibility burden (explicit `VITE_BE_URL`/
`VITE_GW_URL`, a scratch checkout, `playwright` resolution, bounded-and-awaited process cleanup, byte-
verified restoration — every one of round 4's own Important findings 2–5 against it) for a conclusion
section 3.2 already establishes by direct, cited source reading, with no browser required. Held per the
coordinator's own stated preference: drop rather than risk a script that cannot be made lint-clean,
Prettier-clean and fully reproducible in one pass.

## 6. Verification — confirming nothing changed, this response

No production, test or config file changes in this packet, at any round. Every number below is 050.7e's
own baseline, re-run fresh this response.

- `(cd apps/wbs/fe-01 && bunx tsc --noEmit -p tsconfig.spec.json)`: exit 0.
- `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/)`: `7 files / 71 tests`, all green — 050.7e's own
  unchanged baseline.
- The sandbox unit command (`docs/superpowers/plans/2026-09-19-batch-1/README.md`'s own "Frontend
  tests inside the sandbox"): `46 files / 674 tests`.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`: `114`/`114`/`0`.
- `git diff --stat e9b7f83b`, this worktree, before this packet's own final commit: only this document.

## 7. What lands, this commit

**This commit**: this document only. **No executor slice.** This record is committed by the planner as
documentation; nothing is dispatched. `tasks.md` is not edited (task 5 stays unchecked, in place,
exactly as it already reads); `verify.md` is not edited. There is no ready-to-commit path list, no
commit subject beyond this packet's own, and no planner-only follow-up list, because there is no
implementation this round authorizes anyone to carry out.

## 8. Addendum compliance, point by point (not exempted)

| Point                                     | Meets it? | Basis                                                                                                                                                          |
| ----------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Unchanged-code red                     | N/A       | No production code in this packet, changed or unchanged-tested.                                                                                                |
| 2. Typecheck and lint                     | N/A       | No prescribed source; section 6's own commands are re-verification only.                                                                                       |
| 3. Cumulative path counts                 | N/A       | No cumulative path-count gate; no files change.                                                                                                                |
| 4. Preserve command failure status        | N/A       | No executable commands are prescribed for a dispatch to run against new code.                                                                                  |
| 5. HEAD-reading rename tests              | N/A       | No rename.                                                                                                                                                     |
| 6. Sandbox restrictions                   | N/A       | No executor dispatch this round (section 7).                                                                                                                   |
| 7. Known contention flake                 | N/A       | No test run this packet prescribes is subject to it.                                                                                                           |
| 8. Product/module names                   | Yes       | No obsolete identifier requires repointing.                                                                                                                    |
| 9. Slice form, baselines, proofs, privacy | N/A       | No slice; this is a held documentation record, stated as such (section 7).                                                                                     |
| 10. Dependency pins                       | Yes       | No dependency edits prescribed; pins unchanged.                                                                                                                |
| 11. Pipeline-status masking               | N/A       | No affected pipeline.                                                                                                                                          |
| 12. Planner command chaining              | N/A       | No commit/push/gate chain prescribed.                                                                                                                          |
| 13. Module indexes                        | N/A       | No new module file.                                                                                                                                            |
| 14. Bun directory filters                 | N/A       | No Bun-run commands prescribed.                                                                                                                                |
| 15. Interleaving properties               | N/A       | No lifecycle implementation added; the existing model test is untouched.                                                                                       |
| 16. Reference-model redesign              | N/A       | The ownership implementation stays withdrawn, not replaced.                                                                                                    |
| 17. Seed earlier evidence                 | Yes       | Section 3.2 attributes the prior probe's own observation to that earlier round explicitly, never as this response's own fresh run.                             |
| 18. Symbol-based boundary checks          | N/A       | No scanner added.                                                                                                                                              |
| 19. Guard grep inputs                     | N/A       | No prescribed guard/grep check; every grep in this document is this response's own re-verification, cited as such.                                             |
| 20. Claims match proof strength           | Yes       | Section 3 states plainly that a full reload does not prove retirement completion; section 3.3 states plainly what the historical probe does and does not show. |

## 9. Disposition of review 4

- **Critical 1 (full reload does not establish the retirement gate) — FIXED, by holding rather than
  closing.** Section 1 states task 5 stays unchecked; section 3 states why, with the exact spec and
  map citations and the exact unawaited call sites (`application-bootstrap.tsx:303-321`,
  `lifetime-slot.ts:300`); section 4 preserves the adversarial history for whichever future path closes
  it.
- **Critical 2 (the probe certifies retirement that never started) — FIXED, by dropping the probe.**
  Section 5 states why; section 3.3 records the reviewer's own replay (`unmounts=1, closeCalls=0,
status=live` with `startRetirement` removed) as the reason root-emptiness is not retirement evidence,
  and narrows what the one historical observation that remains is allowed to claim.
- **Important 1 (no dispatchable slice; misattributed evidence) — FIXED.** Section 7 states plainly
  there is no executor slice and nothing is dispatched; no verification text anywhere in this packet
  claims a probe run "this attempt" that was not actually run this attempt (there is no probe run at
  all, this round).
- **Important 2 (cleanup can fail while exiting successfully) — MOOT.** The probe that had this defect
  is dropped (section 5), not repaired in place.
- **Important 3 (the probe is not reproducible from a fresh checkout) — MOOT**, same reason.
- **Important 4 (broken two-line Vitest command; wrong Vite anchor) — FIXED.** Section 6 links the
  batch-1 README's own sandbox command instead of re-typing it inline (the exact defect that broke
  under a literal copy-paste replay); section 3 cites `node.js:27224` (re-verified this response,
  `grep -n "else if (!node.importers.size) return true;" node_modules/vite/dist/node/chunks/node.js`),
  not the earlier, wrong `:27222`.
- **Important 5 (the prescribed TypeScript fails repository lint) — MOOT**, the probe carrying those
  six errors is dropped (section 5).
- **Important 6 (the addendum exemption is incorrect) — FIXED.** Section 8 is the full twenty-point
  table, not an exemption.
- **Minor 1 (factual anchors and counts) — FIXED.** The Vite anchor is corrected (above); section 6
  reads `71`, matching `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/)`'s own fresh output this
  response, not the stale `78` an earlier round's text carried over from the withdrawn ownership
  implementation's own baseline.
- **Minor 2 ("exactly one file") — FIXED.** Section 1's own framing no longer claims a bounded blast
  radius; it names the actual mechanism (no accepting boundary anywhere in the chain from the edited
  module to the HTML entry) without asserting how many files that chain contains.
