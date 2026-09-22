# 040.6 E — Bounded replay sweep as the second sealed module

| Field      | Value                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — fifth packet |
| Size class | S, in three slices                                                                                      |
| Slices     | 1 seals the module, 2 installs it from composition, 3 registers it in the wiki pilot                    |
| Implements | `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`, one remaining process module   |
| Planned on | 2026-09-23, every slice rehearsed end to end in a private worktree of `dac77244`                        |

**You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout `run-executor.sh` clones from must contain this packet file itself
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-e-bounded-replay-sweep.md`
must print an entry) and must be a descendant of `dac77244`; dispatch from that commit or its
reviewed integration descendant. Slice 1 has no prior slice to resume from:
`run-executor.sh 040-6-e-bounded-replay-sweep slice-1 <a packet-containing commit sha descended from dac77244> --batch batch-6`
(the launcher's batch-6 default supplies `--batch-dir docs/superpowers/plans/2026-09-21-batch-6`).
Slices 2 and 3 resume the clone the previous slice built:
`run-executor.sh 040-6-e-bounded-replay-sweep slice-N <the same packet-containing commit sha> --resume --require-ancestor <sha of slice N-1's planner commit> --batch batch-6`.
No slice binds a port or needs the network: the whole `pilot-policy.test.ts` run in slice 3 builds
every candidate as a fresh temporary clone under the system temp directory, so **no slice needs
`--network`**. No slice cites an earlier slice's saved evidence, so **no slice needs `--seed`**
either.

**This packet document is itself a "current document."** `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`'s
`legacy-root` scan reaches every tracked `docs/**/*.md` file, including this one, and this packet's
own verified-facts and exact-content sections legitimately quote
`libs/core/src/use-cases/retention-sweep.ts` many times. `docs/findings/current-document-check-exemptions.json`
**already carries this packet's own path** (added alongside the packet document itself, matching
the existing precedent for packet D's own document) — this is a **precondition** for this document
to exist in the tree at all, not work any slice below does. No slice edits that file.

Stop on any of: a red checkpoint reporting `0 tests ran` (the `-t` filter did not match); a mutation
that leaves its named test passing (restore, check the location against section 10, redo once, stop
if it still passes); a step-0 line in section 7 not printing what it says; a section 10 edit anchor
that does not match the file as found (the file drifted from what this packet assumed — stop and
report the mismatch rather than inventing a repair); a pin (`kinds.json` entry count, `modules.json`/`policy.json`
counts, the `repo-namespacing-handoff.test.ts` digest/occurrence numbers) that differs from this
packet's recorded baseline before any edit of this packet's own; any sign that extraction changed
`RetentionTimer`'s or `retentionSweep`'s runtime behaviour, principal handling or shutdown order
rather than only its location; and any edit this packet does not itself prescribe that a check
nonetheless requires (an out-of-lane fix) — report the block, do not make it.

## 1. Goal and non-goals

**Goal.** Extract Bounded replay sweep — the map's `retention: RetentionTimer`, `retentionSweep`
contract responsibility — as the second sealed DI Bag module, following Plan history's exact
pattern from `docs/superpowers/plans/2026-09-21-batch-6/040-6-a-di-composition-first-module.md`: a
module directory with a README, a contract, a labelled `module.ts` and a composition check, proving
by test that the production installer hands out the contract's exports and nothing else, and that
the module's label names a binding in a real DI failure message; the former files left as
compatibility re-export shims; `compose.ts` installing the module instead of constructing
`RetentionTimer` by hand; `kinds.json` rows rewritten in place; full wiki-pilot registration
(README index block, `modules.json` row, `policy.json` boundary with a `sourceSelector` to its
predecessor at the pilot's frozen revision), following
`docs/superpowers/plans/2026-09-21-batch-6/040-6-d-wiki-registration.md`'s mechanism.

**Non-goals.** No library version bump: `di-bag` stays 0.4.0. No frontend, no gateway, no MCP. No
change to Plan history. No new checker over source shapes: the sideways-boundary rows this packet
adds are the same identity-based mechanism `ports/sideways-type-boundaries.test.ts` already uses
(a path-string predicate whose violations are resolved through the TypeScript checker's own symbol
identity, never a regex or a syntax walk). No label-agreement check: "Deferred: label agreement" in
packet D's own document explains why that remains out of scope for every module, this one included.
No second module: section 4's measurement shows Bounded replay sweep alone was the clear next pick;
Realtime, Saved plans, Plan import, Authentication and Optimization are handed to later packets in
dependency order (section 9).

## 2. Read first

| File                                                                                                                           | Why                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, `LLM_README.md`                                                                                                   | Rules R1 to R5; read only the entry your slice needs.                                                                                                                          |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`                                                        | The ownership map: Bounded replay sweep's row, and packet A's own section 9 ordering of packet E's candidates.                                                                 |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-a-di-composition-first-module.md`                                             | The pattern-setter: module shape, `PLAN_HISTORY_LABEL`, the four negatives, the `check.ts`/`module.ts` split.                                                                  |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-d-wiki-registration.md`                                                       | The wiki registration mechanism verbatim, and "Deferred: label agreement."                                                                                                     |
| `openspec/changes/adopt-di-composition/tasks.md`                                                                               | Tasks 1.1, 1.3, 1.4 and 1.8 already ticked by packets A–C (1.2, 1.5, 1.6 and 1.7 remain open); 2.1, 2.2 and 7.5 are Plan history's own landing; 3.1 is this packet's own task. |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`'s "Standard blocks every packet uses" — "OpenSpec validation"            | The exact `jq -s -e` contract every OpenSpec validation in section 7 uses; never a loose success check.                                                                        |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`                                                         | The identity-based no-sideways rule; slice 1 rewrites one row and adds one.                                                                                                    |
| `tools/tool-devsync/src/service-kinds.ts`                                                                                      | `SERVICE_ROOTS` names exactly three directories; `src/module` is not one of them.                                                                                              |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`                                                                                | `pilotPaths` is a fixed array `createCandidate()` overlays from the working tree; slice 3 adds one line.                                                                       |
| `libs/wbs/application/core/src/compose.ts`, `src/index.ts`                                                                     | Slice 2 edits both; read `composeServices` and the export barrel's sort order.                                                                                                 |
| `libs/wbs/application/core/src/use-cases/retention-sweep.ts`, `src/service/retention-timer.ts`, `src/service/retention-job.ts` | Slice 1 moves all three; read them in full before editing.                                                                                                                     |

## 3. Verified facts

Every line was read, or the command run, in a private worktree of `dac77244` on 2026-09-23.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                              | Evidence                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packet C's task 1.4 already moved `AuthenticatedUser`/`InternalIdentity` to `@wbs/contracts`, so `use-cases/retention-sweep.ts` and `service/retention-timer.ts` no longer import Authentication or `http/endpoint.ts`.                                                                                                                                                                                                           | `grep -n "^import"` over both files; `tasks.md`'s ticked 1.4 entry.                                                                                              |
| `retention-job.ts` (33 lines), `retention-timer.ts` (158 lines) and `retention-sweep.ts` (41 lines) import only ports (`EventLogStore`, `PlanEventStore`, `Intervals`) and `@wbs/contracts` — zero sideways edges to any other feature or resource.                                                                                                                                                                               | Read all three files in full.                                                                                                                                    |
| Realtime's four files (`replay-orchestrator.ts` 110, `use-cases/replay.ts` 26, `replay-buffer.ts` 118, `gateway-broadcaster.ts` 104) are _also_ at zero sideways edges after packet B's neutral event port landed, but total 358 lines against Bounded replay sweep's 232, and Realtime owns the `Broadcaster` port's production adapter plus the `OptimizerTriggerBroadcaster` composition hazard the map's preparation 6 names. | Read all four files; `compose.ts:181-194`; the map's "Delivery and composition hazards … `OptimizerTriggerBroadcaster` remains root-private wiring."             |
| `tools/tool-devsync/src/service-kinds.ts`'s `SERVICE_ROOTS` names exactly `libs/wbs/application/core/src/service`, `libs/wbs/application/core/src/use-cases` and `apps/wbs/be-01/src/service`; `src/module` is outside all three, so a file moved into a module directory needs no new `kinds.json` row regardless of its kind.                                                                                                   | `tools/tool-devsync/src/service-kinds.ts:15-19` (`SERVICE_ROOTS`); confirmed no row exists today for any file under `module/plan-history/`.                      |
| `kinds.json` already carries pre-classified rows for all three files this packet moves: `retention-job.ts` (`support`, "private member of retention-sweep.ts"), `retention-timer.ts` (`support`, "move to the bounded replay sweep module"), `retention-sweep.ts` (`feature`, `capability: bounded-replay-sweep`).                                                                                                                | `docs/code-organization/kinds.json`, read before any edit.                                                                                                       |
| `RetentionTimer`'s `principal: { kind: 'internal' }` is a fixed literal at every production and test call site; no test varies it through the timer's own path (the `forbidden` branch is exercised only through `retentionSweep`/`admission.test.ts` directly).                                                                                                                                                                  | `compose.ts:241` (pre-edit, at `dac77244`); `retention-timer.test.ts:67` (`const internal = { principal: { kind: 'internal' as const } };`, used by every case). |
| `docs/wiki-policy/policy.json`'s existing `boundary.application.use-cases` already carries the exact pre-move blob for `retention-sweep.ts`: `100644 95be165f6581580326f3e10e40de1304138601d2 libs/core/src/use-cases/retention-sweep.ts` at the pilot's frozen revision `7851161b…`. Independently confirmed with `git ls-tree 7851161b… -- libs/core/src/use-cases/retention-sweep.ts`.                                         | `docs/wiki-policy/policy.json` (pre-edit); `git ls-tree` output, identical.                                                                                      |
| `pilot-policy.test.ts`'s `createCandidate()` clones the repository fresh from `repositoryRoot` and overlays **only** the fixed `pilotPaths` array from the working tree; a new module's README is invisible to that candidate until its path is added there.                                                                                                                                                                      | `pilot-policy.test.ts:30-45,101-119`; rehearsed (row 10, section 6).                                                                                             |
| A pre-namespacing path spelled in a module README's own prose (for example `libs/core/src/use-cases/retention-sweep.ts`) trips `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`'s current-document sweep, independently of the wiki-pilot mechanism; Plan history's own README avoids this by never spelling its predecessor's path ("the single service file it was extracted from").                                   | Rehearsed (row 11, section 6); `libs/wbs/application/core/src/module/plan-history/README.md`'s existing "Wiki registration" section, read.                       |
| `docs/wiki-policy/modules.json` already carries an unrelated `module.archive.bounded-replay-sweep` (an archived OpenSpec change's frozen pilot boundary, ring `archive`, nothing to do with this module). `check-indexes` resolves both this and the new `module.application.bounded-replay-sweep` to distinct, correct index entries.                                                                                            | `docs/wiki-policy/modules.json`, pre-edit; `check-indexes` output over the rehearsed tree.                                                                       |
| `docs/findings/current-document-check-exemptions.json` already exempts packet D's own plan document for the same reason this packet needs an exemption: its exact-content sections repeatedly cite a pre-move `libs/core/…` path.                                                                                                                                                                                                 | `docs/findings/current-document-check-exemptions.json`, the `040-6-d-wiki-registration.md` entry.                                                                |

## 4. Why this module and not another

Packet A's own section 9 lists the remaining process modules in this order: Bounded replay sweep,
Realtime, Saved plans, Plan import, Authentication, Optimization. Measured directly against the
tree at `dac77244` rather than assumed from that ordering:

| Candidate                | Sideways edges after B/C                                        | Total lines                                                 | Composition hazard                                                                                                                                                                    | Verdict                                                                                                           |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Bounded replay sweep** | **0**                                                           | **232** (33+158+41)                                         | None: `compose.ts` already builds and returns one `RetentionTimer`; `bootBe01` already owns `start()`/`stop()`.                                                                       | **Chosen.** Smallest, cleanest, no port it doesn't already have.                                                  |
| Realtime                 | 0                                                               | 358 (110+26+118+104)                                        | Owns the `Broadcaster` production adapter (`GatewayBroadcaster`) that `OptimizerTriggerBroadcaster` wraps; the map's preparation 6 ties this to the root-supplied optimizer callback. | Next smallest and equally sideways-free, but the composition question is larger; handed to the next packet first. |
| Saved plans              | 0 (feature→resource only, permitted)                            | ~1,700 (`saved-plan.service.ts` 996 + five satellite files) | `saved-plan-retry.ts` is still unresolved (task 1.7 unticked): "wire or delete … before extraction."                                                                                  | Blocked on an open preparation task; not independent yet.                                                         |
| Plan import              | 0                                                               | 466 + `prepare-import.ts` 739                               | None new; capability already accepted (`plan-import`).                                                                                                                                | Larger than Bounded replay sweep; not preferred over Realtime for the next packet either.                         |
| Authentication           | 0 as a source; several other modules used to import it sideways | 178 + `login-throttle.ts` 152                               | Absorbing `LoginThrottle` and the accountful/accountless overload is the map's largest single-module task after Plan commands.                                                        | Larger scope; every other module that used to import it sideways already stopped via packet C's task 1.4.         |
| Optimization             | N/A (lives under `apps/wbs/be-01`, not this library)            | Large                                                       | Preparation 1.5/1.6 (contract extraction, cache-key port) still open.                                                                                                                 | Blocked on its own preparations; last in dependency order per packet A's own section 9.                           |

Bounded replay sweep is the only candidate with **zero sideways edges, the smallest line count, and
no open composition question** — the same three properties that made Plan history the first pick in
packet A. One module, not two: Realtime shares no contract with Bounded replay sweep (both use
`EventLogStore`, an existing port, not a new one they would jointly introduce), so bundling them
would not reduce total work, only this packet's own scope discipline.

## 5. File plan

| Path                                                                                        | Slice   | Create or modify                                                                                                                |
| ------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/application/core/src/module/bounded-replay-sweep/module.test.ts`                  | 1       | create **first**, for the red                                                                                                   |
| `libs/wbs/application/core/src/module/bounded-replay-sweep/bounded-replay-sweep.feature.ts` | 1       | the moved `use-cases/retention-sweep.ts`                                                                                        |
| `libs/wbs/application/core/src/module/bounded-replay-sweep/retention-timer.ts`              | 1       | the moved `service/retention-timer.ts`                                                                                          |
| `libs/wbs/application/core/src/module/bounded-replay-sweep/retention-job.ts`                | 1       | the moved `service/retention-job.ts`                                                                                            |
| `libs/wbs/application/core/src/module/bounded-replay-sweep/contract.ts`                     | 1       | create                                                                                                                          |
| `libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts`                       | 1       | create                                                                                                                          |
| `libs/wbs/application/core/src/module/bounded-replay-sweep/check.ts`                        | 1       | create                                                                                                                          |
| `libs/wbs/application/core/src/module/bounded-replay-sweep/README.md`                       | 1, 3    | slice 1 creates it without a `module-index` block or "Wiki registration"; slice 3 replaces it with section 10.9's final content |
| `libs/wbs/application/core/src/use-cases/retention-sweep.ts`                                | 1       | replaced by a re-export shim                                                                                                    |
| `libs/wbs/application/core/src/service/retention-timer.ts`                                  | 1       | replaced by a re-export shim                                                                                                    |
| `libs/wbs/application/core/src/service/retention-job.ts`                                    | 1       | replaced by a re-export shim                                                                                                    |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`                      | 1       | modify: one row's path renamed, one new directory-scoped row added                                                              |
| `openspec/changes/adopt-di-composition/verify.md`                                           | 1, 2, 3 | modify: each slice appends its own baselines, deltas and evidence basenames                                                     |
| `libs/wbs/application/core/src/compose.ts`                                                  | 2       | modify: install through `installBoundedReplaySweep`                                                                             |
| `libs/wbs/application/core/src/index.ts`                                                    | 2       | modify: two export lines                                                                                                        |
| `docs/code-organization/kinds.json`                                                         | 2       | modify: three rows rewritten in place, 95 entries unchanged                                                                     |
| `docs/wiki-policy/modules.json`                                                             | 3       | modify: one row inserted                                                                                                        |
| `docs/wiki-policy/policy.json`                                                              | 3       | modify: one boundary appended                                                                                                   |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`                                             | 3       | modify: one `pilotPaths` line                                                                                                   |
| `openspec/changes/adopt-di-composition/tasks.md`                                            | 3       | modify: tick 3.1, extend 7.5                                                                                                    |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                   | 3       | modify: re-pin `historical policy selector or baseline` 41→43, occurrences 259→261                                              |

`docs/findings/current-document-check-exemptions.json` is **not** in this list: it already carries
this packet's own entry (the intro's "This packet document is itself a 'current document'"
paragraph), added as a precondition outside any slice, not work a slice does.

**Neighbours.** No other batch-6 packet owns any of these paths. `openspec/changes/adopt-di-composition/tasks.md`
is also touched by A/B/C/D's own ticks, all already landed; this packet's edits are additive to
untouched lines. Section 12's per-slice hand-over lists are each scoped to that slice's own
`base=$(git rev-parse HEAD)`, so the planner's own commits (including a revision of this packet
file) cannot break them.

## 6. Rehearsed observations

Every red, green and fault below was produced in a private worktree of `dac77244`, against the
final listings in section 10; restore a mutated file from a copy under `"$TMPDIR"` and prove it
with `cmp` before asserting on any captured status.

| #   | Where                                                                                                   | Fault injected                                                                                                                                                              | Test that observed it                                                                                                                                   | Literal fragment observed                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 1 red, on the unchanged tree                                                                      | none; `contract.ts`, `module.ts` and `check.ts` do not exist yet                                                                                                            | `module.test.ts`                                                                                                                                        | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | slice 1 green, first attempt                                                                            | all module files written                                                                                                                                                    | `module.test.ts`                                                                                                                                        | `6 pass`, `0 fail`, `9 expect() calls`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3   | `check.ts`, the single `return` of `installBoundedReplaySweep`                                          | `const exposed = { retention: bag.resolve('retention'), bag }; return exposed;`                                                                                             | `exposes only the contract exports from its installer`, its FIRST assertion                                                                             | `[ "retention", + "bag" ]`, `- Expected - 0 / + Received + 1`; `0 pass`, `1 fail`, `5 filtered out`                                                                                                                                                                                                                                                                                                                                                       |
| 4   | `check.ts`, the same `return`, made type-correct                                                        | `Object.assign(bag.resolve('retention'), { resolve: bag.resolve.bind(bag) })`                                                                                               | the same test, its SECOND assertion                                                                                                                     | `Expected: true`, `Received: false`; `0 pass`, `1 fail`, `5 filtered out`. `wbs-core:typecheck` **still exits 0** on this mutation, which is why the enumeration test exists                                                                                                                                                                                                                                                                              |
| 5   | `module.ts`, the key tuple of its single `buildModule` call                                             | `['retention', 'retentionOptions']` in place of `['retention']`                                                                                                             | `keeps its private bindings out of a host graph`, `labels its private bindings…`, `names itself when a host omits a requirement`                        | `resolve('retentionOptions')` returned the raw options object instead of throwing; `inspectGraph()` reported bare `retentionOptions`, not `application.bounded-replay-sweep/retentionOptions`; `3 pass`, `3 fail`                                                                                                                                                                                                                                         |
| 6   | `module.ts`, the options object of that same call                                                       | the `{ label: BOUNDED_REPLAY_SWEEP_LABEL }` argument removed                                                                                                                | the two label tests                                                                                                                                     | `inspectGraph()` reported unlabelled `retentionOptions`; the missing-requirement message named `retentionOptions` alone; `4 pass`, `2 fail`                                                                                                                                                                                                                                                                                                               |
| 7   | `ports/sideways-type-boundaries.test.ts`, unchanged rule, injected import                               | `import type { Identity } from '../../http/endpoint';` prepended to `retention-timer.ts`                                                                                    | `rejects the checked sideways-type import routes`                                                                                                       | `[ "module/bounded-replay-sweep/retention-timer.ts: '../../http/endpoint' reaches http/endpoint.ts", "…: Identity reaches http/endpoint.ts" ]`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                        |
| 8   | `ports/sideways-type-boundaries.test.ts`, the new `service/auth.service.ts` row, injected independently | `import type { AuthenticatedUser } from '../../service/auth.service';` prepended to `retention-timer.ts` (restored from row 7's own copy first, so this fault stands alone) | `rejects the checked sideways-type import routes`                                                                                                       | `[ "module/bounded-replay-sweep/retention-timer.ts: '../../service/auth.service' reaches service/auth.service.ts" ]` — **only** that one violation, no `http/endpoint.ts` entry; `0 pass`, `1 fail`. Deleting the new Authentication row while leaving row 7's HTTP fault in place leaves that fault's two violations unchanged (review 1's own check); this fault is what an Authentication-only regression looks like, and only the new row catches it. |
| 9   | slice 2 gate, `kinds.json`                                                                              | none; observing the unedited count                                                                                                                                          | `python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"`                                                  | `95`; the slice's own edit rewrites three rows in place and leaves the count at `95`                                                                                                                                                                                                                                                                                                                                                                      |
| 10  | slice 3, `pilotPaths` unchanged                                                                         | new README absent from the fixed overlay array, with `modules.json`/`policy.json` already registering the module                                                            | `pins exact pre-index tuples and passes observe lint from external trust`                                                                               | `Expected: true`, `Received: false` at the discovered-index-per-mapped-module assertion; `0 pass`, `1 fail`, `20 filtered out`                                                                                                                                                                                                                                                                                                                            |
| 11  | slice 3, README prose (a rehearsed wrong draft, not what section 10.9 prescribes)                       | a literal `libs/core/src/use-cases/retention-sweep.ts` written into the "Wiki registration" paragraph                                                                       | `current documentation and active solver packets use namespaced roots`; `every current document that trips a check carries an exemption for that check` | `[ "…/bounded-replay-sweep/README.md:libs/core/" ]` and `[ "…/README.md:legacy-root" ]`; `2 fail` inside the whole `tool-devsync:test` run (364 pass, 2 fail). Section 10.9's prescribed text avoids this: it never spells the path.                                                                                                                                                                                                                      |
| 12  | slice 3, `repo-namespacing-handoff.test.ts` unchanged pin                                               | registering the new boundary adds a `sourceSelector`/`baselineEntries` path naming `libs/core/`                                                                             | `every legacy source occurrence and relevant text family is pinned`                                                                                     | `'historical policy selector or baseline': 41` → `43`; `digest` and `occurrences: 259` → `261`; `0 pass`, `1 fail`, `14 filtered out`                                                                                                                                                                                                                                                                                                                     |

Each assertion has a mutation that names it. Fault 3 fails only the installer test's first
assertion (the leaked key stops the second from running); fault 4 leaves the key list correct and
fails only the second. Fault 5 fails three tests at once because the exported binding also loses
its label prefix; fault 6 fails only the two label tests. Faults 7 and 8 are independent: each
names exactly one owner, proving each of the two new rows separately rather than one fault standing
in for both. Row 11 is not a fault this packet leaves in place — it is why section 10.9's README
text is worded the way it is, and slice 3 never writes the wrong version first.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses as `if cmd >"$log" 2>&1; then status=0; else status=$?; fi;
printf 'exit=%s\n' "$status" >>"$log"`; never read a status through `tee` and never `|| true`.
Scratch only under `"$TMPDIR"`, mutation patches and failing output under `"$TMPDIR/evidence"`;
evidence references in `verify.md` are basenames relative to that directory, never absolute clone,
home or temporary paths. The executor never runs `git add`, `git commit` or any other Git-state
command; a working-tree mutation is injected by editing the file directly, observed, then restored
with `cp` from a `"$TMPDIR"` copy and proved with `cmp`. The planner commits each slice, and records
`base=$(git rev-parse HEAD)` in its own step 0.

### Slice 1 — Seal Bounded replay sweep as a DI Bag module

**Step 0.**

```sh
set -euo pipefail
test ! -d libs/wbs/application/core/src/module/bounded-replay-sweep && echo "gate: module absent"
test -f libs/wbs/application/core/src/service/retention-timer.ts
wc -l < libs/wbs/application/core/src/service/retention-timer.ts
test -f libs/wbs/application/core/src/service/retention-job.ts
wc -l < libs/wbs/application/core/src/service/retention-job.ts
test -f libs/wbs/application/core/src/use-cases/retention-sweep.ts
wc -l < libs/wbs/application/core/src/use-cases/retention-sweep.ts
NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core --skip-nx-cache
```

Expect the gate line, `158`, `33`, `41`, then exit 0. Record this slice's own whole-core baseline:

```sh
(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/slice-1-core-baseline.log" 2>&1
echo "exit=$?"
tail -4 "$TMPDIR/evidence/slice-1-core-baseline.log"
```

Call that pass count `C` and file count `F`. Observed on the rehearsed tree: `543 pass`, `0 fail`,
55 files. The end of this slice requires `C + 6` and `F + 1`, never an absolute number.

Tests first, then the implementation, both inside this one slice:

1. Create `libs/wbs/application/core/src/module/bounded-replay-sweep/module.test.ts` from section
   10.1 verbatim and run it. Expect row 1's red: `error: Cannot find module './check'`, `0 pass`,
   `1 fail`, `1 error`. This red is evidence, not a commit.
2. Move the three files. The planner's form is `git mv`:
   - `use-cases/retention-sweep.ts` → `module/bounded-replay-sweep/bounded-replay-sweep.feature.ts`
   - `service/retention-timer.ts` → `module/bounded-replay-sweep/retention-timer.ts`
   - `service/retention-job.ts` → `module/bounded-replay-sweep/retention-job.ts`

   The executor copies each file to its new path instead, and rewrites its own relative imports per
   section 10.2's exact diffs (one directory level deeper for the two ports imports each of
   `retention-job.ts` and `retention-timer.ts` carries; `retention-timer.ts`'s import of
   `retentionSweep` changes from `'../use-cases/retention-sweep'` to
   `'./bounded-replay-sweep.feature'`; `bounded-replay-sweep.feature.ts`'s import of the pruning
   functions changes from `'../service/retention-job'` to `'./retention-job'`). **Do not delete the
   old paths:** replace each with the compatibility shim of section 10.3 instead —
   `service-boundaries.test.ts:32-33` asserts `retention-job.ts` and `retention-timer.ts` exist at
   their old paths, and `use-cases/admission.test.ts:10` imports `retentionSweep` from
   `./retention-sweep` by relative path.

3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` from section 10.4. The README at
   this point carries no `<!-- module-index -->` block and no "Wiki registration" section — only
   title prose, "## Checks" and "## Consumers" — exactly as Plan history's own slice-4 README did
   before its own wiki-registration packet.
4. `bun test ./libs/wbs/application/core/src/module/bounded-replay-sweep/module.test.ts` → exit 0,
   `6 pass`, `0 fail`, `9 expect() calls` (observed).
5. `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → exit 0. If
   `lint` reports an autofixable import-order error, run
   `bunx eslint --fix libs/wbs/application/core/src/module/bounded-replay-sweep/module.test.ts` and
   do not treat the fix as a stop (batch-2's addendum point 17 permits import-sort and Prettier
   autofixes only — not a lint rule that changes what the test asserts).
6. Apply section 10.5's diff to `ports/sideways-type-boundaries.test.ts`: rename the single-file row
   to the module's new directory and add one new row for `service/auth.service.ts`. Rerun
   `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` → exit 0,
   `1 pass`.
7. The four module negatives, rows 3, 4, 5 and 6 of section 6, **one at a time**, each restored and
   `cmp`-proved before the next. Then the two sideways-boundary negatives, rows 7 and 8, **each its
   own fault, restored and `cmp`-proved before the next** — one fault must not stand in for both new
   rows:
   - Row 7: prepend `import type { Identity } from '../../http/endpoint';` to `retention-timer.ts`,
     run the same boundary test, expect row 7's fragment (the module-specifier and identifier
     violations reaching `http/endpoint.ts`), `0 pass`, `1 fail`; restore, `cmp`-prove, rerun green
     (`1 pass`).
   - Row 8: prepend `import type { AuthenticatedUser } from '../../service/auth.service';` to
     `retention-timer.ts` instead, run the same boundary test, expect row 8's fragment — **only**
     the `service/auth.service.ts` violation, no `http/endpoint.ts` entry — `0 pass`, `1 fail`;
     restore, `cmp`-prove, rerun green (`1 pass`).

   Add the dated `Proof:` comments: two beside `module.ts`'s `buildModule` call (rows 5 and 6), two
   beside `check.ts`'s `return` (rows 3 and 4), and two in `sideways-type-boundaries.test.ts`'s own
   JSDoc above `routes` (rows 7 and 8, each naming its own fault and fragment separately).

8. Tick nothing yet — `tasks.md` 3.1 ticks in slice 3, once the wiki registration also lands, mirroring
   how packet A's own module-extraction slice left its wiki task unticked.
9. Append to `openspec/changes/adopt-di-composition/verify.md`: `C`, `F`, the four module faults
   with their literal fragments, both sideways-boundary faults, and the evidence basenames.
10. Only now the closing checks: `(cd libs/wbs/application/core && bun test src)` → exit 0 with
    `C + 6` passes over `F + 1` files (observed `549 pass`, `0 fail`, 56 files); then
    `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → exit 0; then
    `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `refactor(core): seal Bounded replay sweep as a DI Bag module`. Section 12 gives this
slice's exact hand-over path list, `verify.md`'s append included.

### Slice 2 — Compose Bounded replay sweep from its sealed module

**Step 0.**

```sh
set -euo pipefail
test -f libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts && echo "gate: slice 1 landed"
test -f libs/wbs/application/core/src/compose.ts
grep -cF "new RetentionTimer({" libs/wbs/application/core/src/compose.ts
test -f docs/code-organization/kinds.json
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect the gate line, `1`, then a number; call it `K` and record it (observed `95`; the end of this
slice requires `K`, unchanged, never an absolute figure). Record this slice's own whole-core
baseline the way slice 1 does and call it `C` (observed `549 pass` over 56 files after slice 1).

1. Apply section 10.6's diff to `compose.ts`: import `installBoundedReplaySweep` and the
   `RetentionTimer` type from the new module path, drop the class import from
   `./service/retention-timer`, and replace the `new RetentionTimer({ principal: { kind: 'internal' }, …
})` construction with `installBoundedReplaySweep({ … }).retention` (the `principal` field moves
   out of the call site entirely — the module now supplies it). The `onSweep` and `onError`
   callback bodies are byte-for-byte unchanged from the pre-edit file — section 10.6 shows them in
   full; do not summarize or reconstruct them.
2. Apply section 10.6's diff to `index.ts`: two new export lines in sorted position.
3. Apply section 10.7's diff to `kinds.json`: the three rows for `retention-job.ts`,
   `retention-timer.ts` and `retention-sweep.ts` rewritten in place to the `re-export shim;`
   disposition prefix (exempt from the rationale-required rule); no row added for any file under
   `module/bounded-replay-sweep/`, and none removed.

| Command                                                                                                                                                                                              | Expect                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core,wbs-domain --skip-nx-cache`                                                                                                | exit 0 (one `eslint --fix` on `compose.ts` may be needed for import order — fix it, do not stop)                                                                                               |
| `test -f dist/libs/wbs/application/core/portable-composition.js && grep -c "application.bounded-replay-sweep" dist/libs/wbs/application/core/portable-composition.js` (after `build:portable` below) | at least `1`                                                                                                                                                                                   |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`                                                                                                                                | exit 0                                                                                                                                                                                         |
| `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                                                                                                                    | exit 0                                                                                                                                                                                         |
| `(cd apps/wbs/be-01 && bun test src/service/retention-job.test.ts src/app.test.ts src/controller/history.controller.test.ts)`                                                                        | exit 0, `13 pass`, `0 fail`, `37 expect() calls` (observed). Confirms the two-level shim chain (be-01's own `retention-job.ts` shim → `@wbs/core` → this packet's shim → the module) resolves. |
| `test -f docs/code-organization/kinds.json && python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"`                                                  | `K`, the step-0 value, unchanged                                                                                                                                                               |
| `(cd libs/wbs/application/core && bun test src)`                                                                                                                                                     | exit 0, `C` passes, `0 fail` — this slice adds no test                                                                                                                                         |

Tick nothing in `tasks.md` here either. Append to `openspec/changes/adopt-di-composition/verify.md`:
`K`, `C`, the portable-bundle grep result and the be-01 values. Only after those appends:
`GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `refactor(core): compose Bounded replay sweep from its sealed module`. Section 12
gives this slice's exact hand-over path list, `verify.md`'s append included.

### Slice 3 — Register Bounded replay sweep as a trusted pilot boundary

**Step 0.** Requires slices 1 and 2 committed: `createCandidate()`'s clone only sees committed
content for a path outside `pilotPaths`, and every module source file this slice's README indexes
is outside that array.

```sh
set -euo pipefail
git log -1 --format=%H -- libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
test -f docs/wiki-policy/modules.json
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
test -f docs/wiki-policy/policy.json
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
git ls-tree -r 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/use-cases/retention-sweep.ts
```

Expect a commit hash, then two equal counts — call them `M` and `B` (observed `7` and `7`, since
Plan history's own registration already landed) — then one
`100644 blob 95be165f6581580326f3e10e40de1304138601d2 libs/core/src/use-cases/retention-sweep.ts`
tuple; if that last line is empty, stop. Record, each into its own log under `"$TMPDIR/evidence"`
with the `if cmd >"$log" 2>&1; then …` wrapper (so a slow command's completion is durable evidence
rather than a line a later tool call cannot see again):

```sh
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t 'every legacy source occurrence and relevant text family is pinned'
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)
```

Expect exit 0, then `1 pass`/`0 fail`/`1 expect() calls`, then `21 pass`/`0 fail` — call that whole
run's assertion count `P` (observed `294`, one more than packet D's own recorded `293` baseline,
because Plan history's boundary already exists on this tree; the executor records its own `P`
rather than trusting this number). The whole `pilot-policy.test.ts` file never writes to the
executor's own clone — every candidate is a fresh temporary one (`createCandidate():101-119`) — so,
unlike `tool-devsync:test`, the executor may run it directly; give it a generous timeout
(`timeout 600 bun test …`), since it spawns the CLI many times (~340s observed).

Also run the "OpenSpec validation" standard block (§2) once, before any edit:

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
report=$(mktemp "$TMPDIR/evidence/openspec-validation-baseline.XXXXXX.json")
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

Expect exit 0. Record `jq -r '.summary.totals.passed' "$report"` as `N` (observed `114`; this
packet adds or removes no OpenSpec change or specification, so closure at step 10 requires exactly
`N` passed and `0` failed, never an absolute figure another packet's own OpenSpec work could move).

1. Replace `libs/wbs/application/core/src/module/bounded-replay-sweep/README.md`'s content with
   section 10.9 verbatim — the module-index block and the "Wiki registration" section both land in
   this one step, together. `GSETTINGS_BACKEND=memory bunx prettier --write` it then `--check` it;
   expect exit 0 both times.
2. Add one row to `docs/wiki-policy/modules.json`'s `modules` array from section 10.8 verbatim
   (insert it immediately before the `module.application.plan-history` entry, alphabetically). Run
   `bun run apps/wiki/cli/src/cli.ts validate module-mapping docs/wiki-policy/modules.json` → exit 0,
   `valid module-mapping`.
3. Row 10's setup, not yet its red: the `pilotPaths` line from step 5 below is **not** applied yet.
   Run the whole `pilot-policy.test.ts` file (the command above, no `-t` filter). Expect exit 1 at
   the length-parity assertion inside "pins exact pre-index tuples and passes observe lint from
   external trust": `Expected: 7`, `Received: 8` (`M` vs `M + 1`). This red is evidence, not a
   commit.
4. Add one boundary to `docs/wiki-policy/policy.json`'s `boundaries` array from section 10.8
   verbatim (append it last, so `boundaries.at(0)` stays `boundary.domain.saved-plan`, the pin this
   test's own object-match assertion checks). Rerun the whole file. Expect a **different** failure
   now: the discovered-index assertion — `Expected: true`, `Received: false` — because the module is
   now fully declared (row 10's actual red) but its README is still invisible to any candidate:
   nothing in `pilotPaths` yet names it.
5. Apply the diff of section 10.10 to `pilot-policy.test.ts`: add the new README's path to
   `pilotPaths`, alphabetically before `.../module/plan-history/README.md`. Rerun the whole file.
   Expect exit 0, `21 pass`, `0 fail`, `P + 1` `expect()` calls (observed `295`).
6. The legacy-pin's own red, **filtered, not the whole `tool-devsync:test` target** — that whole
   target is the planner's: it writes Git objects the executor's read-only `.git` refuses, exactly
   as packet D's own slice 2 names. Rerun the filtered legacy-pin command from step 0. Expect exit 1,
   `1 fail`, `0 pass`, `1 expect() calls`, `historical policy selector or baseline` at `43` where the
   pin still says `41`, `occurrences` at `261` where the pin says `259`, and a different `digest`.
   Apply section 10.11's diff (the category number, the occurrence count, the digest, and one new
   dated `Proof:` comment recording exactly this).
7. Rerun the same filtered command. Expect exit 0, `1 passed`, `0 failed`, `1 expect() calls`.
8. Apply section 10.12's diff to `openspec/changes/adopt-di-composition/tasks.md`: tick 3.1 (recording
   what slices 1 and 2 already did) and extend 7.5's landed list. (`docs/findings/current-document-check-exemptions.json`
   is **not** touched here or anywhere in this packet — its entry for this document is a
   precondition, per the intro's "This packet document is itself a 'current document'" paragraph.)
9. `NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache` → exit 0. This slice's final
   typecheck, after every edit above; step 0 already ran the same target once, before, as this
   slice's baseline.
10. Rerun the "OpenSpec validation" standard block from step 0. Expect exit 0, and
    `jq -r '.summary.totals' "$report"` prints `passed` equal to `N` (this packet adds or removes no
    OpenSpec change or specification) and `failed` equal to `0`.
11. Append to `openspec/changes/adopt-di-composition/verify.md`: `M`, `B`, `P`, `N`, the historical
    blob tuple, both reds and both greens' fragments, the pin-move before/after values, and the
    evidence basenames.
12. `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

**Do not** touch `docs/wiki-policy/modules.bootstrap.json` or `bootstrap-policy.json` — they are a
separate change's candidate artifacts. **Do not** write the README's "Wiki registration" prose any
way other than section 10.9's exact text: row 11 of section 6 is what an early, plausible-looking
wording actually does.

Planner commit: `docs(wiki-policy): register Bounded replay sweep in the pilot`. Section 12 gives
this slice's exact hand-over path list, `verify.md`'s append included. (This packet document's own
landing in the tree, and the `docs/findings/current-document-check-exemptions.json` entry beside
it, is a separate, earlier commit — the intro's "Dispatch" paragraph names it as the prerequisite
`run-executor.sh` clones from, the same relationship packet D's own document has to its three
slices.)

## 8. Planner-only checks

| Check                                                                        | Why it is the planner's                                                                                                                                                                         | Value observed on the rehearsed tree |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `NX_DAEMON=false bunx nx run wbs-be-01:test:unit`                            | One be-01 unit file binds a TCP port (packet A's own finding); nothing in this packet needs loopback, so the target moves, not the dispatch.                                                    | pending planner verification         |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`              | Writes Git objects over the working tree; the executor's clone is read-only.                                                                                                                    | `366 pass`, `0 fail`                 |
| `NX_DAEMON=false bunx nx run wbs-core:test`                                  | Whole-target integration verification with coverage; runs the same files `test:unit` discovers and no core test binds a port.                                                                   | `549 pass`, `0 fail`, 56 files       |
| `NX_DAEMON=false bunx nx run wbs-be-01:test`                                 | Opens SQLite databases.                                                                                                                                                                         | pending planner verification         |
| `NX_DAEMON=false bunx nx run wbs-core:test:portable`                         | Runs Playwright; the executor has no browser.                                                                                                                                                   | pending planner verification         |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test`                         | Whole listener-test target; `apps/wiki/cli/project.json:23` explicitly excludes `packaging/install.test.ts` and `packaging/consumer-bootstrap.test.ts` from it, so it does not cover packaging. | pending planner verification         |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test:package --skip-nx-cache` | The excluded packaging suite (`apps/wiki/cli/project.json:85`, depends on `pack`); no slice of this packet touches packaging, but it is part of the standard integration matrix below.          | pending planner verification         |
| `bin/h2puni-gate.sh <sha>`                                                   | Takes the host-wide heavy lock.                                                                                                                                                                 | pending planner verification         |

This table supplements the mandatory full "Integration verification" matrix in the batch-1 README;
it does not replace that matrix. That matrix — strict OpenSpec validation, the repository-wide
format check, uncached tests/lint/typecheck/build for every project but the Burokrat, and the
Burokrat's own build, source lint and package install test — is run once by the planner on a clean
checkout of the integration commit after this packet merges.

`NX_DAEMON=false bunx nx run twilight-burokrat:typecheck` and `…:lint:source` both exited 0 on the
rehearsed tree and are not planner-only — the executor runs both in slice 3 wherever this packet's
edits touch `apps/wiki/cli`. No slice adds a project target or a scanned-source comment line beyond
the two test pins slice 3 already accounts for, so `tools/tool-devsync/src/workspace-inventory.test.ts`
was not expected to move and was not separately rehearsed; it is covered by the whole
`tool-devsync:test` pass above.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once (packet A/D's own note); do not edit that test or any other test this packet does
not name.

## 9. What the next 040.6 packets should be

1. **Next — Realtime.** Zero sideways edges today (packet B's neutral event port already lets
   `gateway-broadcaster.ts` and `replay-orchestrator.ts` avoid every sibling import), but it owns
   the `Broadcaster` production adapter `GatewayBroadcaster`, which `compose.ts` wraps in
   `OptimizerTriggerBroadcaster` when `runtime.onPlanChanged` is supplied — the map's preparation 6.
   That packet's design question is whether the sealed module still lets composition choose the
   decorator, or whether the module contract needs to state the callback as an optional
   requirement. `replay-buffer.ts` has no imports at all and moves trivially.
2. **Then — Plan import.** Capability already accepted (`plan-import`); `Clock`/`Scheduler`/`UnitOfWork`/`Broadcaster`
   plus a per-scope `ImportServices` factory that borrows Directory/Work item resource contracts —
   a permitted feature→resource edge, not sideways.
3. **Saved plans** is blocked on task 1.7 (`saved-plan-retry.ts`: "wire or delete … under the
   accepted saved-plans obligation") before its own extraction packet can start.
4. **Authentication** absorbs `LoginThrottle` and the accountful/accountless overload split; every
   module that used to import it sideways already stopped via packet C's task 1.4, so it is not
   currently blocking any other module — only its own scope makes it larger than a next pick.
5. **Optimization** stays last: preparations 1.5 and 1.6's second half are still open, and it lives
   under `apps/wbs/be-01`, so its wiki registration will need a `module.backend.optimization`
   identifier rather than `module.application.*`.

## 10. Exact content

### 10.1 `module.test.ts` (slice 1, step 1)

```ts
import { inMemoryPlanEvents } from '@wbs/store-memory/history-fixture';
import { inMemoryEventLog } from '@wbs/store-memory/replay-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import type { Intervals } from '../../ports/timers';
import { installBoundedReplaySweep } from './check';
import { BOUNDED_REPLAY_SWEEP_LABEL } from './contract';
import { boundedReplaySweepModule } from './module';

/** Never fires on its own; the one test that needs a tick uses {@link fakeSchedule}. */
const noopIntervals: Intervals = {
  every: () => () => undefined,
};

/**
 * A schedule a test advances by hand, borrowed from `retention-timer.test.ts`'s
 * own fixture: real `setInterval` would make this file flaky under load, and
 * the thing under test is the sweep the module wires, not the clock.
 */
function fakeSchedule(): { every: Intervals['every']; advance: () => void } {
  let tick: (() => void) | null = null;
  return {
    every: (_milliseconds, fire) => {
      tick = fire;
      return () => {
        tick = null;
      };
    },
    advance: () => {
      if (tick === null) throw new Error('the timer never scheduled');
      tick();
    },
  };
}

const requirements = () => ({
  eventLog: inMemoryEventLog(),
  planEvents: inMemoryPlanEvents(),
  intervals: noopIntervals,
  now: () => 0,
  maxPerSubscription: 10,
  planEventRetentionDays: 365,
  intervalMs: 1_000,
  onError: () => undefined,
});

/**
 * A complete host graph over the same requirements.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 Plan history's own module.test.ts
 * records for its two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .installModule(boundedReplaySweepModule)
    .register({
      eventLog: DiBag.fromSyncFactory(() => inMemoryEventLog()),
      planEvents: DiBag.fromSyncFactory(() => inMemoryPlanEvents()),
      intervals: DiBag.fromSyncFactory((): Intervals => noopIntervals),
      now: DiBag.fromSyncFactory(() => () => 0),
      maxPerSubscription: DiBag.fromSyncFactory(() => 10),
      planEventRetentionDays: DiBag.fromSyncFactory(() => 365),
      intervalMs: DiBag.fromSyncFactory(() => 1_000),
      onSweep: DiBag.fromSyncFactory(() => undefined),
      onError: DiBag.fromSyncFactory(() => () => undefined),
    })
    .build();

describe('the Bounded replay sweep module', () => {
  it('builds a timer that is not running until started', () => {
    const { retention } = installBoundedReplaySweep(requirements());

    expect(retention.isRunning()).toBe(false);
  });

  it('starts, sweeps on the borrowed schedule and stops', async () => {
    const schedule = fakeSchedule();
    const eventLog = inMemoryEventLog();
    await eventLog.record('project:a', {});
    await eventLog.record('project:a', {});
    const { retention } = installBoundedReplaySweep({
      ...requirements(),
      eventLog,
      intervals: { every: schedule.every },
      maxPerSubscription: 1,
    });

    retention.start();
    expect(retention.isRunning()).toBe(true);
    schedule.advance();
    await retention.stop();

    expect(retention.isRunning()).toBe(false);
    expect(await eventLog.rangeSince('project:a', -1)).toHaveLength(1);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as Plan history's own installer test: an object with
   * an extra property still satisfies `BoundedReplaySweepExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installBoundedReplaySweep(requirements());

    expect(Object.keys(exposed)).toEqual(['retention']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('retentionOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "retentionOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${BOUNDED_REPLAY_SWEEP_LABEL}/retentionOptions`,
    );
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .installModule(boundedReplaySweepModule)
      .register({
        eventLog: DiBag.fromSyncFactory(() => inMemoryEventLog()),
        intervals: DiBag.fromSyncFactory((): Intervals => noopIntervals),
        now: DiBag.fromSyncFactory(() => () => 0),
        maxPerSubscription: DiBag.fromSyncFactory(() => 10),
        planEventRetentionDays: DiBag.fromSyncFactory(() => 365),
        intervalMs: DiBag.fromSyncFactory(() => 1_000),
        onSweep: DiBag.fromSyncFactory(() => undefined),
        onError: DiBag.fromSyncFactory(() => () => undefined),
      }) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('retention')).toThrow(
      `Cannot resolve "${BOUNDED_REPLAY_SWEEP_LABEL}/retentionOptions": dependency "planEvents" is not registered. Resolution path: retention -> ${BOUNDED_REPLAY_SWEEP_LABEL}/retentionOptions -> planEvents.`,
    );
  });
});
```

### 10.2 The three moved files, exact relative-import diffs

`bounded-replay-sweep.feature.ts` (from `use-cases/retention-sweep.ts`, otherwise byte for byte):

```diff
-import { runPlanEventRetention, runRetention } from '../service/retention-job';
+import { runPlanEventRetention, runRetention } from './retention-job';
```

`retention-timer.ts` (from `service/retention-timer.ts`, otherwise byte for byte):

```diff
-import type { EventLogStore } from '../ports/event-log-store';
-import type { PlanEventStore } from '../ports/plan-event-store';
-import type { Intervals } from '../ports/timers';
-import { retentionSweep } from '../use-cases/retention-sweep';
+import type { EventLogStore } from '../../ports/event-log-store';
+import type { PlanEventStore } from '../../ports/plan-event-store';
+import type { Intervals } from '../../ports/timers';
+import { retentionSweep } from './bounded-replay-sweep.feature';
```

`retention-job.ts` (from `service/retention-job.ts`, otherwise byte for byte):

```diff
-import type { EventLogStore } from '../ports/event-log-store';
-import type { PlanEventStore } from '../ports/plan-event-store';
+import type { EventLogStore } from '../../ports/event-log-store';
+import type { PlanEventStore } from '../../ports/plan-event-store';
```

### 10.3 The three compatibility shims (full replacement content)

`libs/wbs/application/core/src/use-cases/retention-sweep.ts`:

```ts
/**
 * Compatibility re-export: Bounded replay sweep moved into its own sealed module.
 *
 * Kept because `use-cases/admission.test.ts` imports this relative path
 * directly and `@wbs/core`'s barrel still deep-imports it. It goes when every
 * importer names the module.
 */
export * from '../module/bounded-replay-sweep/bounded-replay-sweep.feature';
```

`libs/wbs/application/core/src/service/retention-timer.ts`:

```ts
/**
 * Compatibility re-export: Bounded replay sweep moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path and delivery still
 * deep-imports it. It goes when every importer names the module.
 */
export * from '../module/bounded-replay-sweep/retention-timer';
```

`libs/wbs/application/core/src/service/retention-job.ts`:

```ts
/**
 * Compatibility re-export: Bounded replay sweep moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path and be-01's own
 * `retention-job.ts` re-export shim still deep-imports it through `@wbs/core`.
 * It goes when every importer names the module.
 */
export * from '../module/bounded-replay-sweep/retention-job';
```

### 10.4 `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 1)

`contract.ts`:

```ts
import type { EventLogStore } from '../../ports/event-log-store';
import type { PlanEventStore } from '../../ports/plan-event-store';
import type { Intervals } from '../../ports/timers';
import type { RetentionTimer, Swept } from './retention-timer';

/**
 * What a host must supply to install {@link boundedReplaySweepModule}.
 *
 * Both stores are repository ports, and that is existing K3 debt this
 * extraction preserves rather than fixes — the same preserved debt
 * `libs/wbs/application/core/src/module/plan-history/contract.ts` records for
 * `HistoryService`. Closing it needs resource-services over these two stores
 * that no accepted change supplies, so `adopt-di-composition` records it as
 * open and this module claims no K3 compliance either.
 *
 * `onSweep` is optional because a process that does not care to log a sweep's
 * counts still needs the sweep to run; `onError` is required for the reason
 * `retention-timer.ts`'s own JSDoc gives: a silently dead timer looks identical
 * to a healthy one from outside.
 */
export interface BoundedReplaySweepRequirements {
  readonly eventLog: EventLogStore;
  readonly planEvents: PlanEventStore;
  readonly intervals: Intervals;
  readonly now: () => number;
  readonly maxPerSubscription: number;
  readonly planEventRetentionDays: number;
  readonly intervalMs: number;
  readonly onSweep?: (removed: Swept) => void;
  readonly onError: (err: unknown) => void;
}

/** What installing {@link boundedReplaySweepModule} adds to a host graph. */
export interface BoundedReplaySweepExports {
  readonly retention: RetentionTimer;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching `module.application.plan-history`'s; the
 * wiki module identifier is `module.application.bounded-replay-sweep` and the
 * label drops the `module.` prefix.
 */
export const BOUNDED_REPLAY_SWEEP_LABEL = 'application.bounded-replay-sweep';
```

`module.ts`. Its single `buildModule` call is where faults 5 and 6 go, and where the two dated
`Proof:` comments land after those faults are observed:

```ts
import { DiBag } from 'di-bag';

import type { EventLogStore } from '../../ports/event-log-store';
import type { PlanEventStore } from '../../ports/plan-event-store';
import type { Intervals } from '../../ports/timers';
import { BOUNDED_REPLAY_SWEEP_LABEL } from './contract';
import { RetentionTimer, type RetentionTimerOptions, type Swept } from './retention-timer';

/**
 * Bounded replay sweep as a sealed DI Bag module.
 *
 * Only `retention` is exported. `retentionOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.bounded-replay-sweep/retentionOptions` rather
 * than against an anonymous binding.
 *
 * `principal: { kind: 'internal' }` is fixed here rather than a host
 * requirement: `compose.ts` has only ever supplied this one value, and
 * `retention-timer.test.ts`'s every case constructs `RetentionTimer` directly
 * with it too, so no caller has ever varied it. `RetentionTimer` itself keeps
 * `principal` in its own options — this module chooses the value, it does not
 * change what the class accepts.
 *
 * The module registers no disposer, because nothing it owns has one: the
 * timer's own handle is started and stopped by `bootBe01`, exactly as before
 * this module existed. Its lifetime therefore stays the composition root's.
 */
export const boundedReplaySweepModule = DiBag.createBuilder()
  .register({
    retentionOptions: DiBag.fromSyncFactory(
      ({
        eventLog,
        planEvents,
        intervals,
        now,
        maxPerSubscription,
        planEventRetentionDays,
        intervalMs,
        onSweep,
        onError,
      }: {
        eventLog: EventLogStore;
        planEvents: PlanEventStore;
        intervals: Intervals;
        now: () => number;
        maxPerSubscription: number;
        planEventRetentionDays: number;
        intervalMs: number;
        onSweep: ((removed: Swept) => void) | undefined;
        onError: (err: unknown) => void;
      }): RetentionTimerOptions => ({
        principal: { kind: 'internal' },
        repo: eventLog,
        planEvents,
        maxPerSubscription,
        planEventRetentionDays,
        intervalMs,
        intervals,
        now,
        ...(onSweep === undefined ? {} : { onSweep }),
        onError,
      }),
    ),
  })
  .register({
    retention: DiBag.fromSyncFactory(
      ({ retentionOptions }: { retentionOptions: RetentionTimerOptions }): RetentionTimer =>
        new RetentionTimer(retentionOptions),
    ),
  })
  // Proof (2026-09-23): widening the key tuple to `['retention', 'retentionOptions']` left
  // `keeps its private bindings out of a host graph` and `labels its private bindings with the
  // module name` failing (3 pass, 3 fail) — `resolve('retentionOptions')` stopped throwing and
  // `inspectGraph()` reported the bare key `retentionOptions` with no label prefix.
  // Proof (2026-09-23): dropping `{ label: BOUNDED_REPLAY_SWEEP_LABEL }` left only the two label
  // tests failing (4 pass, 2 fail): `inspectGraph()` reported `retentionOptions` unlabelled, and a
  // missing requirement's message named `retentionOptions` instead of
  // `application.bounded-replay-sweep/retentionOptions`.
  .buildModule(['retention'], { label: BOUNDED_REPLAY_SWEEP_LABEL });
```

`check.ts`. The single `return` is faults 3 and 4's location:

```ts
import { DiBag } from 'di-bag';

import type { BoundedReplaySweepExports, BoundedReplaySweepRequirements } from './contract';
import { boundedReplaySweepModule } from './module';

/**
 * Installs {@link boundedReplaySweepModule} over supplied requirements and
 * returns only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Bounded replay
 * sweep can reach a private binding or a host key through it. The type
 * checker does not enforce that on its own: an object with an extra property
 * returned through a variable still satisfies {@link BoundedReplaySweepExports},
 * so the module's tests enumerate what this function returns.
 */
export function installBoundedReplaySweep(
  requirements: BoundedReplaySweepRequirements,
): BoundedReplaySweepExports {
  const bag = DiBag.createBuilder()
    .installModule(boundedReplaySweepModule)
    .register({
      eventLog: DiBag.fromSyncFactory(() => requirements.eventLog),
      planEvents: DiBag.fromSyncFactory(() => requirements.planEvents),
      intervals: DiBag.fromSyncFactory(() => requirements.intervals),
      now: DiBag.fromSyncFactory(() => requirements.now),
      maxPerSubscription: DiBag.fromSyncFactory(() => requirements.maxPerSubscription),
      planEventRetentionDays: DiBag.fromSyncFactory(() => requirements.planEventRetentionDays),
      intervalMs: DiBag.fromSyncFactory(() => requirements.intervalMs),
      onSweep: DiBag.fromSyncFactory(() => requirements.onSweep),
      onError: DiBag.fromSyncFactory(() => requirements.onError),
    })
    .build();
  // Proof (2026-09-23): returning `{ retention: bag.resolve('retention'), bag }` left
  // `exposes only the contract exports from its installer` failing on its first assertion —
  // `Object.keys(exposed)` reported `["retention", "bag"]` — 0 pass, 1 fail, 5 filtered out.
  // Proof (2026-09-23): keeping the key list correct but hanging `resolve` on the returned
  // service (`Object.assign(bag.resolve('retention'), { resolve: bag.resolve.bind(bag) })`) left
  // the same test failing on its SECOND assertion instead (`Expected: true`, `Received: false`),
  // with `wbs-core:typecheck` still exiting 0 on both mutations.
  return { retention: bag.resolve('retention') };
}
```

`README.md` (slice 1's version — no `module-index` block, no "Wiki registration" section yet):

```md
# Bounded replay sweep

The bounded replay sweep, run on a schedule. This is the second sealed DI Bag module in the core,
following Plan history's pattern: `module.ts` seals the graph and exports `retention` alone,
`check.ts` is the only place that builds a bag, and `contract.ts` states the two repository ports
and the scheduling primitives a host must supply — the same preserved K3 debt Plan history's
contract records, not compliance. Private bindings are named under the
`application.bounded-replay-sweep` label, so a DI failure says which module asked.

`bounded-replay-sweep.feature.ts` (the moved `use-cases/retention-sweep.ts`) coordinates both
bounded rules; `retention-job.ts` is its private port-backed pruning pair; `retention-timer.ts` is
the lifecycle adapter that runs the sweep on a schedule — its `start()`/`stop()` stay called by
`bootBe01` exactly as before this module existed, so the module registers no disposer of its own.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`,
`libs/wbs/application/core/src/service/retention-job.ts`,
`libs/wbs/application/core/src/service/retention-timer.ts` and
`libs/wbs/application/core/src/use-cases/retention-sweep.ts` keep the former `@wbs/core` deep-import
names. Workspace-relative paths rather than Markdown links:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative link against the file
that carries it, and this listing is quoted inside a plan document at another depth.
```

### 10.5 `ports/sideways-type-boundaries.test.ts`, exact diff (slice 1)

```diff
  * Each row is a preparation of
  * `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`: the
- * first three are preparations 4 and 5 (no use case and no retention timer
- * imports Authentication or the HTTP endpoint for a principal), the fourth is
- * preparation 3 (Plan document reads markers through a port, not through the
- * Calendar marker resource).
+ * first two are preparations 4 and 5 (no use case imports Authentication or the
+ * HTTP endpoint for a principal); the third and fourth are the same rule
+ * re-scoped to the Bounded replay sweep module's own directory once its
+ * `retention-timer.ts` and `retention-sweep.ts` (now
+ * `bounded-replay-sweep.feature.ts`) moved out of `use-cases/` and stopped
+ * being covered by the first two rows' `path.startsWith('use-cases/')` — a
+ * directory row rather than the single-file one this replaces, since the
+ * module also holds `retention-job.ts`, which never carried a principal type
+ * but should not gain one unnoticed either; the fifth is preparation 3 (Plan
+ * document reads markers through a port, not through the Calendar marker
+ * resource).
+ *
+ * Proof: importing `type { Identity } from '../../http/endpoint'` into the
+ * module's `retention-timer.ts` failed this suite with both a module-specifier
+ * and an identifier violation — `"module/bounded-replay-sweep/retention-timer.ts:
+ * '../../http/endpoint' reaches http/endpoint.ts"` and `"…: Identity reaches
+ * http/endpoint.ts"` — against an expected empty array, 0 pass and 1 fail
+ * (2026-09-23).
+ * Proof: importing `type { AuthenticatedUser } from '../../service/auth.service'`
+ * into the same file, independently, failed this suite with only
+ * `"module/bounded-replay-sweep/retention-timer.ts: '../../service/auth.service'
+ * reaches service/auth.service.ts"` — no `http/endpoint.ts` entry — against an
+ * expected empty array, 0 pass and 1 fail (2026-09-23). Deleting the new
+ * `service/auth.service.ts` row while leaving the HTTP-endpoint fault above in
+ * place leaves that fault's two violations unchanged, so this second fault is
+ * what proves the Authentication row independently.
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
   { reaches: 'http/endpoint.ts', from: (path: string) => path.startsWith('use-cases/') },
-  { reaches: 'http/endpoint.ts', from: (path: string) => path === 'service/retention-timer.ts' },
+  {
+    reaches: 'service/auth.service.ts',
+    from: (path: string) => path.startsWith('module/bounded-replay-sweep/'),
+  },
+  {
+    reaches: 'http/endpoint.ts',
+    from: (path: string) => path.startsWith('module/bounded-replay-sweep/'),
+  },
   {
     reaches: 'service/calendar-marker.service.ts',
     from: (path: string) => path === 'service/plan-document.ts',
```

### 10.6 `compose.ts`, `index.ts`, exact diffs (slice 2)

```diff
 import type { AuthenticatedUser, Logger } from '@wbs/contracts';

+import { installBoundedReplaySweep } from './module/bounded-replay-sweep/check';
+import type { RetentionTimer } from './module/bounded-replay-sweep/retention-timer';
 import { installPlanHistory } from './module/plan-history/check';
 import type { HistoryService } from './module/plan-history/plan-history.feature';
 import type { Clock } from './ports/clock';
@@ import { ReplayOrchestrator } from './service/replay-orchestrator';
-import { RetentionTimer } from './service/retention-timer';
 import { SavedPlanService } from './service/saved-plan.service';
@@
-    retention: new RetentionTimer({
-      principal: { kind: 'internal' },
-      repo: source.stores.eventLog,
+    retention: installBoundedReplaySweep({
+      eventLog: source.stores.eventLog,
       maxPerSubscription: shared.replayMaxPerSubscription,
       planEvents: source.stores.planEvents,
       planEventRetentionDays: shared.planEventRetentionDays,
       intervalMs: shared.retentionIntervalMs,
       intervals: runtime.intervals,
       now: () => runtime.clock.now(),
       onSweep: (removed) => {
         if (removed.eventLog > 0) {
           shared.logger.info({ removed: removed.eventLog }, 'event log pruned');
         }
         if (removed.planEvents > 0) {
           shared.logger.info({ removed: removed.planEvents }, 'plan history pruned');
         }
       },
       onError: (error) => {
         shared.logger.error({ err: error }, 'retention sweep failed');
       },
-    }),
+    }).retention,
```

The `onSweep` and `onError` bodies above are byte-for-byte identical to the pre-edit file
(`compose.ts:249-258` at `dac77244`); nothing inside either callback changes — only the surrounding
`new RetentionTimer({ principal: …, repo: … })` call becomes `installBoundedReplaySweep({ eventLog: … })`,
and the trailing `,` becomes `.retention,`. Prove it after editing with
`sed -n '/onSweep: (removed) => {/,/^    }).retention,/p' libs/wbs/application/core/src/compose.ts`
matching the block shown here.

```diff
 export * from './compose';
 export * from './http/import.routes';
+export * from './module/bounded-replay-sweep/contract';
+export * from './module/bounded-replay-sweep/module';
 export * from './module/plan-history/contract';
 export * from './module/plan-history/module';
```

Run `bunx eslint --fix libs/wbs/application/core/src/compose.ts` after applying the first diff if
`lint` reports an import-order error — `simple-import-sort/imports` moves the two new lines into
their sorted position on its own.

### 10.7 `kinds.json`, exact diff (slice 2)

```diff
     {
       "path": "libs/wbs/application/core/src/service/retention-job.ts",
       "kind": "support",
-      "disposition": "private member of retention-sweep.ts",
-      "rationale": "retention-sweep.ts is its only production importer and uses its two port-backed pruning functions while coordinating the bounded replay sweep"
+      "disposition": "re-export shim; delete when importers use @wbs/core or the bounded-replay-sweep module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/retention-timer.ts",
       "kind": "support",
-      "disposition": "periodic retention trigger; move to the bounded replay sweep module",
-      "rationale": "composeServices constructs it to invoke the retentionSweep feature over EventLogStore and PlanEventStore on an injected Intervals schedule and Clock, with lifecycle and failure reporting"
+      "disposition": "re-export shim; delete when importers use @wbs/core or the bounded-replay-sweep module directly"
     },
@@
     {
       "path": "libs/wbs/application/core/src/use-cases/retention-sweep.ts",
-      "kind": "feature",
-      "capability": "bounded-replay-sweep",
-      "rationale": "RetentionTimer calls it to coordinate count-bounded EventLogStore pruning and age-bounded PlanEventStore pruning for the bounded replay sweep"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the bounded-replay-sweep module directly"
     },
```

Run `GSETTINGS_BACKEND=memory bunx prettier --write docs/code-organization/kinds.json` after
applying it; entry count stays `95`.

### 10.8 `docs/wiki-policy/modules.json`, the new row; `docs/wiki-policy/policy.json`, the new boundary (slice 3)

Insert immediately before the `module.application.plan-history` entry in `modules.json`'s `modules`
array:

```json
{
  "moduleId": "module.application.bounded-replay-sweep",
  "name": "Bounded replay sweep sealed DI Bag module",
  "memberships": [
    {
      "kind": "directory-prefix",
      "prefix": "libs/wbs/application/core/src/module/bounded-replay-sweep",
      "exclusions": []
    }
  ],
  "predecessorModuleIds": [],
  "indexPath": "libs/wbs/application/core/src/module/bounded-replay-sweep/README.md",
  "externalConsumers": {
    "kind": "declared",
    "memberships": [
      { "kind": "path", "path": "libs/wbs/application/core/src/compose.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/index.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/service/retention-job.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/service/retention-timer.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/use-cases/retention-sweep.ts" }
    ]
  }
}
```

Append to `policy.json`'s `boundaries` array (last, so `boundaries.at(0)` stays unchanged):

```json
{
  "boundaryId": "boundary.application.bounded-replay-sweep",
  "selector": {
    "kind": "prefix",
    "value": "libs/wbs/application/core/src/module/bounded-replay-sweep"
  },
  "sourceSelector": {
    "kind": "prefix",
    "value": "libs/core/src/use-cases/retention-sweep.ts"
  },
  "baselineEntries": [
    {
      "mode": "100644",
      "blob": "95be165f6581580326f3e10e40de1304138601d2",
      "path": "libs/core/src/use-cases/retention-sweep.ts"
    }
  ],
  "obligationIds": []
}
```

Run `GSETTINGS_BACKEND=memory bunx prettier --write` on both files after inserting. Prettier may
re-wrap a neighbouring, otherwise-untouched array entry earlier in `modules.json` purely because the
file's total width recalculation changed — this is reflow, not a content change; do not revert it.

### 10.9 `README.md`, final content (slice 3 replaces the slice-1 version)

```md
# Bounded replay sweep

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.bounded-replay-sweep","memberships":[{"kind":"path","path":"bounded-replay-sweep.feature.ts"},{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"retention-job.ts"},{"kind":"path","path":"retention-timer.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"The read-before-events and single-timer-loop invariants are documented on RetentionTimer and retentionSweep; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/retention-job.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/retention-timer.ts"},{"kind":"path","path":"libs/wbs/application/core/src/use-cases/retention-sweep.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the three compatibility shims are declared; a deep import of bounded-replay-sweep.feature.ts, retention-timer.ts or retention-job.ts by a test fixture elsewhere is not tracked here."}} -->

The bounded replay sweep, run on a schedule. This is the second sealed DI Bag module in the core,
following Plan history's pattern: `module.ts` seals the graph and exports `retention` alone,
`check.ts` is the only place that builds a bag, and `contract.ts` states the two repository ports
and the scheduling primitives a host must supply — the same preserved K3 debt Plan history's
contract records, not compliance. Private bindings are named under the
`application.bounded-replay-sweep` label, so a DI failure says which module asked.

`bounded-replay-sweep.feature.ts` (the moved `use-cases/retention-sweep.ts`) coordinates both
bounded rules; `retention-job.ts` is its private port-backed pruning pair; `retention-timer.ts` is
the lifecycle adapter that runs the sweep on a schedule — its `start()`/`stop()` stay called by
`bootBe01` exactly as before this module existed, so the module registers no disposer of its own.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`,
`libs/wbs/application/core/src/service/retention-job.ts`,
`libs/wbs/application/core/src/service/retention-timer.ts` and
`libs/wbs/application/core/src/use-cases/retention-sweep.ts` keep the former `@wbs/core` deep-import
names. Workspace-relative paths rather than Markdown links:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative link against the file
that carries it, and this listing is quoted inside a plan document at another depth.

## Wiki registration

This module is a full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.bounded-replay-sweep` (`docs/wiki-policy/policy.json`'s
`boundary.application.bounded-replay-sweep`). The boundary's `sourceSelector` binds this new
directory to the single pre-namespacing use case it was extracted from, the file
`docs/code-organization/kinds.json` classified `capability: bounded-replay-sweep` before the move,
which existed at the pilot's frozen `sourceRevision` — the same mechanism
`boundary.application.plan-history` uses for its own predecessor. `retention-timer.ts` and
`retention-job.ts` are not separately named in the source
selector: the wiki registration's guarantee is narrower than "every file in this module has a
pilot-tracked predecessor", exactly as Plan history's own README says of its label agreement — see
the plan's "Deferred: label agreement" for why, and what a later change needs before it can be.
```

**Deliberately does not spell the pre-move path.** Section 6 row 11 records what happens when a
draft of this paragraph does; write it exactly as above.

### 10.10 `apps/wiki/cli/src/policy/pilot-policy.test.ts`, exact diff (slice 3)

```diff
   'docs/wiki-policy/relationships.bootstrap.json',
+  'libs/wbs/application/core/src/module/bounded-replay-sweep/README.md',
   'libs/wbs/application/core/src/module/plan-history/README.md',
   'libs/wbs/application/core/src/use-cases/README.md',
```

### 10.11 `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, exact diff (slice 3)

```diff
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 41,
+      'historical policy selector or baseline': 43,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
```

```diff
     // both naming the pre-move `libs/core/src/service/history.service.ts` this module was
     // extracted from; raised `historical policy selector or baseline` from 39 to 41 and occurrences
     // from 257 to 259, no unclassified entries (2026-09-22).
-    digest: '55fafcaf0420dd5b2e0018b0a0dd467b7c3b8fae950eca69e72a99f52364b725',
-    occurrences: 259,
+    // Proof: registering `module.application.bounded-replay-sweep` added its
+    // `boundary.application.bounded-replay-sweep`'s `sourceSelector` and one `baselineEntries` path,
+    // both naming the pre-move `libs/core/src/use-cases/retention-sweep.ts` this module was
+    // extracted from; raised `historical policy selector or baseline` from 41 to 43 and occurrences
+    // from 259 to 261, no unclassified entries (2026-09-23).
+    digest: 'fb0d422785019f2351c00082e4533b820b0aca3cce8f9789a348e6167099363e',
+    occurrences: 261,
     unclassified: [],
```

### 10.12 `openspec/changes/adopt-di-composition/tasks.md`, exact diff (slice 3)

```diff
-- [ ] 3.1 Bounded replay sweep, borrowing the timer `bootBe01` starts and stops.
+- [x] 3.1 Bounded replay sweep, borrowing the timer `bootBe01` starts and stops. Proof: the
+      module's own tests; negatives: the installer leaking its bag, the private
+      `retentionOptions` binding exported, and the label dropped. Landed 2026-09-23 as
+      `libs/wbs/application/core/src/module/bounded-replay-sweep/`, with
+      `use-cases/retention-sweep.ts`, `service/retention-timer.ts` and `service/retention-job.ts`
+      kept as compatibility re-export shims, and `docs/code-organization/kinds.json`'s three rows
+      for them rewritten in place (95 entries, unchanged) rather than added or removed, because
+      `tools/tool-devsync/src/service-kinds.ts`'s `SERVICE_ROOTS` does not scan `src/module`.
```

The unedited file's actual final line (`tasks.md:115` at `dac77244`) reads
`      own design, not part of 7.5. Each future module ticks 7.5 for its own directory.` with no
trailing text. Replace that exact line with the continuation below, so the whole addition stays one
paragraph of the same `- [x] 7.5` item:

```diff
-      own design, not part of 7.5. Each future module ticks 7.5 for its own directory.
+      own design, not part of 7.5. Each future module ticks 7.5 for its own directory. Landed
+      again 2026-09-23 for Bounded replay sweep as
+      `libs/wbs/application/core/src/module/bounded-replay-sweep/README.md`,
+      `docs/wiki-policy/modules.json`'s `module.application.bounded-replay-sweep` row and
+      `docs/wiki-policy/policy.json`'s `boundary.application.bounded-replay-sweep`, using a
+      `sourceSelector` bound to the pre-move `libs/core/src/use-cases/retention-sweep.ts` alone —
+      the file `kinds.json` classified `capability: bounded-replay-sweep` before the move.
+      `retention-timer.ts` and `retention-job.ts` have no separate baseline entry: 7.5's guarantee
+      names one predecessor per module directory, not one per file it holds, exactly as Plan
+      history's single `history.service.ts` predecessor did not separately name a
+      `contract.ts`/`module.ts`/`check.ts` predecessor either.
```

Write the whole addition (both diffs above) as one continuous paragraph per list item, never a
second paragraph separated by a blank line inside the same `- [x]` item: Prettier re-indents a
two-paragraph checklist item non-idempotently (rehearsed: it drifts to a 14-space indent on the
second `--write` pass).

## 11. Global stop conditions

These are not preconditions — each slice's own step 0 in section 7 holds those, so that a later
slice is never blocked by an earlier slice's own work. Stop on any of the following at any point
(restated from the intro's "Dispatch" paragraph, in the form packet A's own section 11 uses):

- A red checkpoint reports `0 tests ran`: the `-t` filter did not match. Anchor the joined `describe`
  and title, or use the unanchored title alone; never include Bun's printed `>`.
- A mutation leaves its named test passing. That is first a location mistake: restore, check the
  location against section 10, redo once, and stop if it still passes.
- An Nx target outlives the tool's wait. It is STILL RUNNING, not failed: poll it under a
  status-recording wrapper.
- A command needs the network, or an OpenSpec invocation tries to download.
- A step-0 line in section 7 does not print what it says.
- A section 10 edit anchor (an exact line, diff context or JSON entry) does not match the file as
  found. The file drifted from what this packet assumed; report the mismatch, do not invent a repair.
- A pin this packet records before its own edits — `kinds.json`'s entry count, `modules.json`'s or
  `policy.json`'s array lengths, `repo-namespacing-handoff.test.ts`'s digest or occurrence numbers —
  differs from what section 7's own step 0 observes.
- Any sign that extraction changed `RetentionTimer`'s or `retentionSweep`'s runtime behaviour,
  principal handling or shutdown order, rather than only their location.
- Any check this packet names is unavailable. Report the block; never skip it silently.
- A check requires an edit this packet does not itself prescribe (an out-of-lane fix). Report the
  block; never make the edit.

## 12. Ready to commit

Each slice ends in its own planner commit, so there is no single final `git status`. Each slice
records `base=$(git rev-parse HEAD)` in its step 0 and hands over `git diff --name-only "$base"` plus
`git ls-files --others --exclude-standard`, which cannot be broken by the planner's own commits. Every
list below includes the slice's own `openspec/changes/adopt-di-composition/verify.md` append and,
where the slice ticks one, `tasks.md`: those edits are prescribed, so a hand-over that omitted them
would contradict the slice.

| Slice | `git diff --name-only` adds                                                                                                                                                                                                                                                                                                                                                            | Untracked adds                                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `libs/wbs/application/core/src/use-cases/retention-sweep.ts`, `.../service/retention-timer.ts`, `.../service/retention-job.ts` (each replaced by its shim), `.../ports/sideways-type-boundaries.test.ts`, `openspec/changes/adopt-di-composition/verify.md`                                                                                                                            | the eight files under `libs/wbs/application/core/src/module/bounded-replay-sweep/`                                                                                |
| 2     | `libs/wbs/application/core/src/compose.ts`, `.../index.ts`, `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`                                                                                                                                                                                                                                     | nothing                                                                                                                                                           |
| 3     | `libs/wbs/application/core/src/module/bounded-replay-sweep/README.md` (its slice-1 content replaced), `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` | nothing (`docs/findings/current-document-check-exemptions.json` is a precondition, added before slice 1 dispatches — see the intro — and carries no slice-3 edit) |

## 13. Findings for the map and for packets A–D's landed code

- **Map, `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`:** no defect
  found. The map's own note that Bounded replay sweep needs "clock/read limits and callbacks"
  matched this packet's `BoundedReplaySweepRequirements` field-for-field against the pre-existing
  `RetentionTimerOptions`.
- **Packet A:** no defect found; its pattern reproduced cleanly for a second, structurally different
  module (three source files instead of one, a "support" lifecycle adapter beside the feature file
  rather than a single class).
- **`docs/wiki-policy/modules.json`'s pre-existing `module.archive.bounded-replay-sweep`** (an
  archived OpenSpec change's frozen pilot boundary, unrelated to this module) sits one row away from
  the new `module.application.bounded-replay-sweep` once sorted, and both use the bare word
  "bounded-replay-sweep" in their `name` fields. Not a defect — the full identifiers differ by ring
  and `check-indexes` resolves both correctly — but a reader of `modules.json` scanning by eye
  should not conflate the two; this packet's `name` field spells "sealed DI Bag module" to reduce
  that risk.
- **A one-line addition to the map or to `docs/superpowers/plans/2026-09-19-batch-1/README.md`'s
  "Standard blocks" would help every future module packet:** "a module README's prose never spells
  its predecessor's literal path; say 'the file it was extracted from' instead" — section 6 row 11
  is what happens when a draft repeats exactly the mistake Plan history's own README already worked
  around once, silently, with no rule anywhere stating it.

## 14. This packet's own document exemption (precondition record, not a slice)

This packet's "Exact content" sections (10.8, 10.9, 10.11, 10.12) repeatedly cite
`libs/core/src/use-cases/retention-sweep.ts`, the pre-move file `docs/wiki-policy/policy.json`'s new
`sourceSelector` boundary binds to — the same reason packet D's own document needed an entry in
`docs/findings/current-document-check-exemptions.json`. That entry already exists, added alongside
this packet document itself (matching packet D's own precedent), **before** any slice below
dispatches — see the intro's "This packet document is itself a 'current document'" paragraph. No
slice touches that file:

```json
{
  "path": "docs/superpowers/plans/2026-09-21-batch-6/040-6-e-bounded-replay-sweep.md",
  "reason": "task packet whose verified facts and exact-content sections repeatedly cite libs/core/src/use-cases/retention-sweep.ts, the pre-move file docs/wiki-policy/policy.json's new sourceSelector boundary binds to",
  "excuses": ["legacy-root"]
}
```

## 15. Disposition of reviews 1 and 2

**Review 1 (verdict: READY AFTER FIXES).**

- **Critical 1, `verify.md` never named in the file plan or a hand-over list. FIXED.** Added to §5's
  file plan for slices 1–3, and sections 11–12 (Global stop conditions, Ready to commit) give each
  slice's own `git diff --name-only`/untracked list with `verify.md` in it.
- **Important 2, §10.12's second diff quoted a context line that does not exist. FIXED.** The diff
  now shows `tasks.md:115`'s real, unmodified final line as the `-` side.
- **Important 3, the new Authentication row had no independent R5 proof. FIXED.** §6 row 8, §7
  slice 1 step 7 and §10.5's second `Proof:` comment add and rehearse the
  `service/auth.service.ts`-only fault; the observed fragment names only that owner.
- **Important 4, placeholder commands and callback bodies. FIXED.** The Python one-liner is spelled
  out everywhere; §10.6 shows `onSweep`/`onError` byte for byte; the be-01 and pilot-policy commands
  are parenthesized subshells.
- **Important 5, an absolute OpenSpec total with no baseline. FIXED.** Slice 3 step 0 records `N`
  via the standard block; closure requires `N`/`0`.
- **Important 6, packaging verification omitted. FIXED.** `twilight-burokrat:test:package` is in §8
  as pending planner verification, with the exclusion it covers named.
- **Important 7, no dispatch or stop conditions. FIXED.** The intro's "Dispatch" paragraph and §11
  supply both.
- **Minor 8–11, the exemption re-inserted, false documentary claims, `no-empty-function`, missing
  `test -f` guards. FIXED**, as review 2 confirmed directly against the revision (no disposition
  section existed yet for review 1 itself — this section is what review 2 asked for).

**Review 2 (verdict: READY).** No critical or important findings; three wording fixes, applied
without rehearsal since none changes a command or an edit:

- Minor 1: §8's opening now states that its table supplements, and does not replace, the batch-1
  README's full "Integration verification" matrix.
- Minor 2: slice 3 steps 0 and 10 now say this packet "adds or removes no OpenSpec change or
  specification," not "touches no OpenSpec artifact" — accurate, since the packet does edit
  `tasks.md` and `verify.md`, neither of which is a change or a specification.
- Minor 3: slice 1 step 7 names the HTTP fault's two violations as "the module-specifier and
  identifier violations reaching `http/endpoint.ts`," not "Authentication-adjacent"; slice 3 step 3
  now says "Row 10's setup," matching §6's actual row for the `pilotPaths` fault (row 9 is the
  `kinds.json` count).
