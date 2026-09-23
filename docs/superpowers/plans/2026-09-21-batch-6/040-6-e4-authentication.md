# 040.6 E4 — Authentication as the fifth sealed module

| Field      | Value                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — eighth packet                                 |
| Size class | S, in three slices                                                                                                                       |
| Slices     | 1 seals the module, 2 installs it from composition, 3 registers it in the wiki content-review pilot                                      |
| Implements | `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`, task 3.5                                                        |
| Planned on | 2026-09-23, revised after review 1; every slice rehearsed end to end in a private worktree of `7a2f25efc21156c86fa0b02389fb68039bd76e96` |

**Dates in `Proof:` comments, `Landed …` notes and the `no unclassified entries` comment are the planner's rehearsal date; write the date you actually observe (`date -u +%F`) when you add them.** **You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout `run-executor.sh` clones from must contain this packet file itself
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-e4-authentication.md`
must print an entry) and must be a descendant of `7a2f25efc21156c86fa0b02389fb68039bd76e96` (packet
E3's own reviewed integration commit, which already carries packets A through E3); dispatch from
that commit or its reviewed integration descendant. Slice 1 has no prior slice to resume from:
`run-executor.sh 040-6-e4-authentication 1 <a packet-containing commit sha descended from 7a2f25efc21156c86fa0b02389fb68039bd76e96> --batch batch-6`
(the launcher's batch-6 default supplies `--batch-dir docs/superpowers/plans/2026-09-21-batch-6`).
Slices 2 and 3 resume the clone the previous slice built:
`run-executor.sh 040-6-e4-authentication 2 <the same packet-containing commit sha> --resume --require-ancestor <sha of slice 1's planner commit> --preserve evidence --batch batch-6`,
and likewise for slice 3 against slice 2's planner commit. No slice binds a port or needs the
network, so **no slice needs `--network`**; no slice cites an earlier slice's saved evidence beyond
its own immediately preceding slice's committed tree, so **no slice needs `--seed`**.

Stop on any of: a red checkpoint reporting `0 tests ran` (the `-t` filter did not match); a mutation
that leaves its named test passing (restore, check the location against section 10, redo once, stop
if it still passes); a step-0 line in section 7 not printing what it says; a section 10 edit anchor
that does not match the file as found (the file drifted from what this packet assumed — stop and
report the mismatch rather than inventing a repair); a pin (`kinds.json` entry count, the wiki-policy
module/boundary counts) that differs from this packet's recorded baseline before any edit of this
packet's own; any sign that extraction changed `AuthService`'s or `LoginThrottle`'s runtime behaviour
rather than only their location, **except** the one prescribed accountful/accountless change section
11 names explicitly; and any edit this packet does not itself prescribe that a check nonetheless
requires (an out-of-lane fix) — report the block, do not make it.

## 1. Goal and non-goals

**Goal.** Extract Authentication — the map's `Authentication` feature row, whose current
collaborators are `AuthService` and `LoginThrottle` — as the fifth sealed DI Bag module, following
Plan history's, Bounded replay sweep's, Realtime's and Plan import's exact pattern from
`docs/superpowers/plans/2026-09-21-batch-6/040-6-a-di-composition-first-module.md` and
`docs/superpowers/plans/2026-09-21-batch-6/040-6-e3-plan-import.md`: a module directory with a
README, a contract, a labelled `module.ts` and a composition check, proving by test that the
production installer hands out the contract's exports and nothing else, and that the module's label
names a binding in a real DI failure message; the former files left as compatibility re-export
shims; `compose.ts` installing the module instead of constructing `AuthService` and `LoginThrottle`
by hand; `kinds.json` rows rewritten in place. This packet also closes the map's own "Accountless
exports neither Authentication nor throttle" requirement: today `loginThrottle` sits on
`CommonServices` and is constructed unconditionally, even for the accountless graph — this packet
moves it onto `AccountfulServices`, alongside `auth`, watched by a new negative test. It also closes
the map's own "verifier-without-identity-store is unrepresentable" requirement: this module's own
`AuthenticationRequirements['account']` requires `users: UserStore & OidcIdentityStore`
unconditionally, and derives `identities` from that combined store, watched by a compile-negative
fixture. Finally, this packet **registers** the module in the wiki content-review pilot: both of
its own source files predate the pilot's frozen `sourceRevision`, and — following exactly the
precedent Realtime's own packet set (one predecessor per module DIRECTORY, not one per file the
module holds) — `authentication.feature.ts`'s own predecessor alone is a sufficient, valid
`sourceSelector`.

**Non-goals.** No library version bump: `di-bag` stays 0.4.0. No frontend, no gateway, no MCP. No
change to Plan history, Bounded replay sweep, Realtime or Plan import. No new checker over source
shapes: the sideways-boundary rows this packet adds are the same identity-based mechanism
`ports/sideways-type-boundaries.test.ts` already uses. No redesign of `AuthService`/`LoginThrottle`
into the map's own eventual single `Authentication` feature contract: `auth` and `loginThrottle`
seal as two current compatibility values, the same shape Realtime's own
`announcements`/`gatewayBroadcaster`/`replayBuffer` keep — no accepted change supplies that
redesign yet, and inventing one here would exceed a sealing packet's own scope. No K2 closure: the
map's own "Delivery and composition hazards" section separately requires moving throttle
reservation/failure/success/release out of `apps/wbs/be-01/src/controller/auth-password-endpoints.ts`
and into the feature surface — that is real, additional scope this packet does not attempt; task
3.5's own words ("absorbing the login throttle... the accountless graph exports neither") are fully
satisfied by sealing the module, correcting the accountful/accountless split and requiring the
combined store, not by moving delivery's own call sites. No second module: Authentication alone was
the clear next pick after Plan import (section 4); Saved plans and Optimization are handed to later
packets in dependency order (section 9).

## 2. Read first

| File                                                                                                                           | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, `LLM_README.md`                                                                                                   | Rules R1 to R5; read only the entry your slice needs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`                                                        | The ownership map: Authentication's row (exports one feature contract eventually, `auth` retained as a migration alias; requirements are an accountful `users: UserStore & OidcIdentityStore`, optional verifier, `PasswordHasher`, `TokenCodec`, `Clock`, throttle policy, with "verifier-without-identity-store is unrepresentable" stated explicitly; private members `AuthService` and `LoginThrottle`).                                                                                                                                                                                                                                                                   |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-a-di-composition-first-module.md`                                             | The pattern-setter: module shape, the single-private-binding shape; this module needs two.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-e2-realtime.md` and `openspec/changes/adopt-di-composition/tasks.md:150-178`  | The registration precedent this packet's own slice 3 follows exactly: one `sourceSelector` naming ONE predecessor file registers the WHOLE module directory; satellite files (`gateway-broadcaster.ts`, `replay-buffer.ts`, `replay-orchestrator.ts` for Realtime) get no separate baseline entry. `docs/wiki-policy/policy.json:921` is Realtime's own landed boundary, `sourceSelector` bound to `libs/core/src/use-cases/replay.ts` alone.                                                                                                                                                                                                                                  |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-e3-plan-import.md`                                                            | The fourth module, landed: slice shape and its own section 9's "Then — Authentication" note. Its own wiki-registration finding (no predecessor at all for either of its two files) is a DIFFERENT situation from Authentication's own (both files predate the freeze); do not conflate the two.                                                                                                                                                                                                                                                                                                                                                                                |
| `openspec/changes/adopt-di-composition/tasks.md`                                                                               | Task 3.5 ("Authentication, absorbing the login throttle and covering the password-only and OIDC graphs; the accountless graph exports neither") is this packet's own task, quoted verbatim in section 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`'s "Standard blocks every packet uses" — "OpenSpec validation"            | The exact `jq -s -e` contract every OpenSpec validation in section 7 uses; never a loose success check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`                                                         | The identity-based no-sideways rule; slice 1 adds five new rows — four scoped to `use-cases/`, `module/bounded-replay-sweep/`, `module/realtime/` and `module/plan-import/` (reaching this module's new real file, independently proven for each scope — section 6), and one scoped to `module/authentication/` itself (reaching `http/endpoint.ts`).                                                                                                                                                                                                                                                                                                                          |
| `libs/wbs/application/core/src/service/auth.service.ts`, `src/service/login-throttle.ts`, `src/service/login-throttle.test.ts` | Slice 1 moves all three; read the two production files in full before editing. `auth.service.ts` re-exports `AuthenticatedUser` from `@wbs/contracts` at its own end (line 57) — it does not declare that type itself.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `libs/wbs/domain/contracts/src/principal.ts`, `libs/wbs/application/core/src/http/endpoint.ts`                                 | `AuthenticatedUser`/`InternalIdentity` already live in contracts (packet C's own task 1.4); `Identity` already depends on `@wbs/contracts`, not on `service/auth.service.ts`. This module needs no principal-type move of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `libs/wbs/application/core/src/ports/user-store.ts`, `src/ports/stores.ts`                                                     | `UserStore`, `OidcIdentityStore` and `TransactionalStores.users: UserStore & OidcIdentityStore` — the combined-store shape this module's own contract now requires unconditionally.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `libs/wbs/application/core/src/compose.ts`, `src/compose.test.ts`                                                              | Slice 2 edits both; read `composeServices`'s `auth: new AuthService({...})`/`loginThrottle: new LoginThrottle({...})` construction, the `CommonServices`/`AccountfulServices` split, and the existing `graph.auth`/`@ts-expect-error` negative in `compose.test.ts` this packet's own negative matches in shape.                                                                                                                                                                                                                                                                                                                                                               |
| `apps/wbs/be-01/src/controller/auth-password-endpoints.ts`, `src/http/identity.ts`, `src/middleware/authenticated.ts`          | Read-only for this packet: they show the current K2 debt (delivery calls `LoginThrottle.reserve`/`recordFailure`/`recordSuccess` and `AuthService.register`/`login`/`authenticate` directly) this packet's own non-goals explicitly do not close.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/wbs/be-01/src/service/auth.service.ts`, `src/service/login-throttle.ts`                                                  | The be-01 app-layer compatibility shims (`export * from '@wbs/core/service/auth.service'`), already classified `re-export shim` in `kinds.json` and unchanged by this packet — the reason `service/auth.service.ts` must stay a real file at its own path rather than being deleted.                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/code-organization/kinds.json`                                                                                            | Both rows for `service/auth.service.ts` and `service/login-throttle.ts` are already classified (`feature`/`authentication` and `support`/"move to the authentication module"). Slice 2 (section 10.7) rewrites both rows to `"kind": "support"` with `"disposition": "re-export shim; delete when importers use @wbs/core or the authentication module directly"` — `auth.service.ts` explicitly changes `kind` from `feature` to `support` (it is now a shim, not the feature itself; the feature classification moves with the code to the module's own README index); `login-throttle.ts` was already `support` and keeps that `kind`, only its `disposition` text changes. |
| `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, `apps/wiki/cli/src/policy/pilot-policy.test.ts`               | Slice 3 edits all three: one row in `modules.json`, one boundary in `policy.json` (both matching Realtime's own single-predecessor shape), and one new `pilotPaths` entry (its own hardcoded overlay array, read at `pilot-policy.test.ts:30-47`) naming this module's own README so `createCandidate()`'s clone can see it.                                                                                                                                                                                                                                                                                                                                                   |
| `apps/wiki/cli/src/policy/trust.ts:50-60,380-421`                                                                              | `BoundarySelector`'s two kinds (`path`, `prefix`, never a list), and the loader's own kind-match/empty-baseline/structural checks this packet's own slice 3 rehearses in order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                                      | `LEGACY_ROOT` scans every current, unarchived document, module READMEs included, for a pre-namespacing path spelled out literally — this packet's own README describes its predecessor by filename only. `every legacy source occurrence and relevant text family is pinned` is the legacy-pin test slice 3's own registration moves; read the exact pin/digest/Proof-comment convention Realtime's own packet set.                                                                                                                                                                                                                                                            |

## 3. Verified facts

Every line was read, or the command run, in this private worktree of
`7a2f25efc21156c86fa0b02389fb68039bd76e96` on 2026-09-23.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Evidence                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The map's "Required no-sideways preparations" list (1 through 8) names no preparation Authentication is blocked on. Tasks 1.2, 1.5, 1.6 and 1.7 (the four unticked no-sideways/backend preparations) are about `broadcast.ts`'s `AnnouncementCollector`, Optimization's spawn/child interfaces, `SolverObjectiveName`/cache-key port, and `saved-plan-retry.ts` respectively — none names `service/auth.service.ts` or `service/login-throttle.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `openspec/changes/adopt-di-composition/tasks.md`'s section 1, read in full before any edit; task 1.4's own line 23 names `service/auth.service.ts` only as an owner other files reach, already resolved.                                         |
| `service/auth.service.ts` (178 lines) imports only `AuthenticatedUser`/`OidcIdentity` (type-only) from `@wbs/contracts`, and `Clock`/`OidcVerifier`/`PasswordHasher`/`TokenCodec`/`OidcIdentityStore`/`User`/`UserStore` (all type-only) from its own ports — zero sideways edges. `service/login-throttle.ts` (152 lines) imports **nothing**. Total 330 lines, matching the map's own row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Read both files in full; `grep -n "^import"` over each; `wc -l` on both.                                                                                                                                                                         |
| **The module accepted a forbidden graph (review 1's own Critical 2), found by re-reading the map, not merely by re-reading the code.** `AuthServiceOptions.identities?: OidcIdentityStore` is optional and separate from `users: UserStore`, so the legacy constructor's own type permits `oidc` supplied over a `users` value that answers only `UserStore` — `AuthService.resolveOidcIdentity` would then throw at runtime rather than being refused at compile time. The map's own row (`040-6-backend-module-map.md:152`) states "verifier-without-identity-store is unrepresentable" as a requirement this module's own contract must enforce, not merely a runtime behaviour to preserve. **Fix:** `AuthenticationRequirements['account']` requires `users: UserStore & OidcIdentityStore` unconditionally (never split, never conditional on `oidc`'s presence); `identities` is always derived from that one store inside `module.ts`'s own private `authOptions` binding. The legacy `AuthServiceOptions` type itself is untouched. A compile-negative fixture (`verifierWithoutStore` in `module.test.ts`) supplies a `users` value satisfying only `UserStore` alongside an `oidc` verifier; its own `@ts-expect-error` is load-bearing — removing the `NonNullable<AuthServiceOptions['identities']>` intersection member from the contract left it failing `wbs-core:typecheck` with `TS2578: Unused '@ts-expect-error' directive` (section 6).                                                                       | `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md:152`; `libs/wbs/application/core/src/service/auth.service.ts`'s own `AuthServiceOptions` (`identities?:`); the compile-negative fault rehearsed and reverted (section 6). |
| `http/endpoint.ts`'s own `Identity` union is built from `@wbs/contracts`'s own re-exports, not from `service/auth.service.ts`. Packet C's task 1.4 already moved the principal types. This module needs no principal-type move of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `libs/wbs/application/core/src/http/endpoint.ts:1-32`; `libs/wbs/domain/contracts/src/principal.ts` (full file, 30 lines).                                                                                                                       |
| `kinds.json` already carries pre-classified rows for both files: `service/auth.service.ts` (`feature`, `capability: authentication`) and `service/login-throttle.ts` (`support`, `disposition: "authentication admission throttle; move to the authentication module"`). Total entries `K=95`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `docs/code-organization/kinds.json`, read before any edit.                                                                                                                                                                                       |
| `service/login-throttle.test.ts` (2 tests) is a real test file, not a shim candidate: retaining it at its old path would duplicate its own two tests against the `C + N`/`F + 1` totals (review 1's own Critical 1). It must be **relocated**, not copied-and-shimmed like the two production files.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `libs/wbs/application/core/src/service/login-throttle.test.ts`, read in full (30 lines, 2 tests).                                                                                                                                                |
| **Sideways-boundary gap, proven for all four existing `from` scopes independently, not merely asserted.** The checker's module-specifier route reports the owner a module specifier's own symbol resolves to, without following re-export aliases inside that file — an import through the shim path `'../../service/auth.service'` is still caught by the existing four `reaches: 'service/auth.service.ts'` rows, but a **direct** import of the module's own new real path is not. Reproduced independently for each scope: `use-cases/run-command-batch.ts`, `module/bounded-replay-sweep/retention-timer.ts`, `module/realtime/gateway-broadcaster.ts` and `module/plan-import/plan-import.feature.ts` each importing `AuthenticatedUser` from the new real path failed the boundary suite independently, one fault at a time, restored between each (section 6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts:371` (the `routes` traversal itself; lines 248-281 are setup and commentary above it); four independent faults rehearsed and reverted (section 6).                         |
| **The frozen-revision predecessor check — Authentication's own two files individually predate the pilot's freeze, unlike Plan import's own two files.** `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/auth.service.ts` returns one entry, blob `73c84b20a377349c4fd215cb90a4807ef3370267`. `git log --follow` traces `auth.service.ts` to its introduction at commit `f0dbbd5010042a6b77d3ec7cbc478e7c8eac546f` (2026-08-04) and `login-throttle.ts` to `26f60a8235dad10a3be2e699cb8b0fc23841f44d` (2026-08-24) — both well before the freeze (2026-09-10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/auth.service.ts` (one tuple); `git log --follow --format="%H %ad %s" --date=short` on the current path.                                                           |
| **Registration is possible, following Realtime's own exact precedent (review 1's own Critical 3: a first revision of this packet wrongly concluded otherwise, and that finding is withdrawn — section 13).** `openspec/changes/adopt-di-composition/tasks.md:150` and Realtime's own landed `docs/wiki-policy/policy.json:921` establish that 7.5's own guarantee is one predecessor per module DIRECTORY, not one per file the module holds: Realtime registered using only `libs/core/src/use-cases/replay.ts` as its `sourceSelector`, with `gateway-broadcaster.ts`, `replay-buffer.ts` and `replay-orchestrator.ts` carrying no separate baseline entry. Authentication's own `login-throttle.ts` is exactly analogous. Rehearsed in full: adding `module.application.authentication` to `modules.json` alone produced the PARITY red (`modules.length` `9`≠`10`); adding the matching `boundary.application.authentication` (single-file `sourceSelector`) restored parity and passed the structural baseline comparison, then produced the DISCOVERED-INDEX red (the module's committed README was not yet in `pilotPaths`' own overlay); adding the `pilotPaths` entry and the final README restored green — the whole suite passed `21` tests, `0` failures, `297` `expect()` calls (up from the pre-registration `296`, one more assertion from the per-boundary `expect(boundary.baselineEntries).toEqual(...)` loop at `pilot-policy.test.ts:342-348` running once per boundary, over ten boundaries instead of nine). | `openspec/changes/adopt-di-composition/tasks.md:150-178`; `docs/wiki-policy/policy.json:921` (Realtime's own landed boundary); the full parity-red → discovered-index-red → green sequence rehearsed in order (section 6, section 7 slice 3).    |
| **The legacy-pin re-pin this registration requires.** `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`'s own `every legacy source occurrence and relevant text family is pinned` counts every `libs/core/`/`libs/domain/`-rooted string across the tree, `policy.json` included. Registering the new boundary added its `sourceSelector` and one `baselineEntries` path, both naming `libs/core/src/service/auth.service.ts`: `historical policy selector or baseline` rose from `45` to `47`, `occurrences` from `263` to `265`, digest re-pinned from `a3db8f9766fa58137d1067c35e0628fd9020100aac871e07c0137a28ac772cd4` to `3eca3cf1a2f8d1703b42edfd40be279a5a144034c000a812d7b70eb8b2cfef62`, `unclassified` stayed empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `tools/tool-devsync/src/repo-namespacing-handoff.test.ts:612-820`, rehearsed red then re-pinned green (section 6, section 7 slice 3).                                                                                                            |
| **The module README must not spell out a pre-namespacing path literally, independently of whether registration succeeds.** `LEGACY_ROOT` scans every current, unarchived document, module READMEs included. A first draft of this module's own README, describing its predecessor as `libs/core/src/service/auth.service.ts` literally, failed `tool-devsync:test` reporting that path's own directory root four times. Bounded replay sweep's, Realtime's and Plan import's own landed READMEs all describe their predecessors by filename only — this packet's own final README (section 10.8) follows the same discipline. `openspec/changes/adopt-di-composition/tasks.md` and `verify.md` are **not** scanned by this same check (the sweep names exactly one active OpenSpec packet as "current prose", a different change), so their own legacy-path citations need no such care.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `tools/tool-devsync/src/repo-namespacing-handoff.test.ts:30-31,37` (`LEGACY_ROOT`, `ACTIVE_OPENSPEC_PACKET`); the fault reproduced and fixed live (section 6).                                                                                   |

## 4. Why this module and not another

Packet A's, packet E2's and packet E3's own section 9 each listed the remaining process modules in
dependency order: Saved plans (blocked on task 1.7), then Authentication, then Optimization (last,
blocked on tasks 1.5/1.6's second half). Measured directly against the tree at
`7a2f25efc21156c86fa0b02389fb68039bd76e96` rather than assumed from any prior packet's own note:

| Candidate          | Sideways edges after A-E3                            | Total lines         | Composition hazard                                                                                                                      | Verdict                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication** | **0**                                                | **330** (178 + 152) | Two real, bounded hazards this packet closes: `loginThrottle` moves off `CommonServices`, and `account.users` becomes a combined store. | **Chosen.** Zero sideways edges, no open preparation, both hazards the map itself names are small and closeable in one slice; registration follows an established precedent (section 3). |
| Saved plans        | 0 (feature→resource only, permitted)                 | ~1,700              | `saved-plan-retry.ts` is still unresolved (task 1.7 unticked): "wire or delete … before extraction."                                    | Still blocked on the same open preparation packet E3 recorded.                                                                                                                           |
| Optimization       | N/A (lives under `apps/wbs/be-01`, not this library) | Large               | Preparations 1.5/1.6's second half still open (the cache-key port is still owed).                                                       | Blocked on its own preparations; last in dependency order per packet A's own section 9.                                                                                                  |

## 5. File plan

| Path                                                                            | Slice   | Create or modify                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/application/core/src/module/authentication/module.test.ts`            | 1       | create **first**, for the red                                                                                                                                                                               |
| `libs/wbs/application/core/src/module/authentication/authentication.feature.ts` | 1       | copied from `service/auth.service.ts`, with its own imports re-pointed                                                                                                                                      |
| `libs/wbs/application/core/src/module/authentication/login-throttle.ts`         | 1       | copied from `service/login-throttle.ts`, unchanged                                                                                                                                                          |
| `libs/wbs/application/core/src/module/authentication/login-throttle.test.ts`    | 1       | **relocated** by filesystem `mv` from `service/login-throttle.test.ts` (its own old path is deleted, not shimmed — its two tests must not be counted twice)                                                 |
| `libs/wbs/application/core/src/module/authentication/contract.ts`               | 1       | create                                                                                                                                                                                                      |
| `libs/wbs/application/core/src/module/authentication/module.ts`                 | 1       | create                                                                                                                                                                                                      |
| `libs/wbs/application/core/src/module/authentication/check.ts`                  | 1       | create                                                                                                                                                                                                      |
| `libs/wbs/application/core/src/module/authentication/README.md`                 | 1, 3    | slice 1 creates it without a `module-index` block or "Wiki registration"; slice 3 replaces it with section 10.8's final content                                                                             |
| `libs/wbs/application/core/src/service/auth.service.ts`                         | 1       | replaced by a re-export shim (the original file's content copied out first, then this file's content replaced — never deleted, since `apps/wbs/be-01/src/service/auth.service.ts` deep-imports it)          |
| `libs/wbs/application/core/src/service/login-throttle.ts`                       | 1       | replaced by a re-export shim, same reasoning                                                                                                                                                                |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`          | 1       | modify: five new rows added (four scoped to existing `from` scopes reaching this module's new file, one scoped to `module/authentication/` reaching `http/endpoint.ts`)                                     |
| `openspec/changes/adopt-di-composition/verify.md`                               | 1, 2, 3 | modify: each slice appends its own baselines, deltas and evidence basenames                                                                                                                                 |
| `libs/wbs/application/core/src/compose.ts`                                      | 2       | modify: install through `installAuthentication`; move `loginThrottle` off `CommonServices` onto `AccountfulServices`                                                                                        |
| `libs/wbs/application/core/src/compose.test.ts`                                 | 2       | modify: a new `@ts-expect-error` negative for `graph.loginThrottle` in the accountless test (applied and observed red BEFORE the `compose.ts` edit), and a `loginThrottle` assertion in the accountful test |
| `libs/wbs/application/core/src/index.ts`                                        | 2       | modify: two export lines                                                                                                                                                                                    |
| `docs/code-organization/kinds.json`                                             | 2       | modify: two rows rewritten in place, 95 entries unchanged                                                                                                                                                   |
| `docs/wiki-policy/modules.json`                                                 | 3       | modify: one row added (`module.application.authentication`), 9 → 10 entries                                                                                                                                 |
| `docs/wiki-policy/policy.json`                                                  | 3       | modify: one boundary added (`boundary.application.authentication`, `sourceSelector` bound to `auth.service.ts` alone), 9 → 10 entries                                                                       |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`                                 | 3       | modify: one `pilotPaths` entry added, in sorted position                                                                                                                                                    |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                       | 3       | modify: the legacy-pin re-pin (`historical policy selector or baseline` 45→47, `occurrences` 263→265, digest re-pinned)                                                                                     |
| `openspec/changes/adopt-di-composition/tasks.md`                                | 3       | modify: tick 3.5, extend 7.5's own running note recording the registration                                                                                                                                  |

This module directory contains **eight** files, not seven: `module.test.ts`, `authentication.feature.ts`,
`login-throttle.ts`, `login-throttle.test.ts`, `contract.ts`, `module.ts`, `check.ts` and `README.md`.

**Neighbours.** No other batch-6 packet owns any of these paths.
`openspec/changes/adopt-di-composition/tasks.md` is also touched by A/B/C/D/E/E2/E3's own ticks, all
already landed; this packet's edits are additive to untouched lines. Section 12's per-slice
hand-over lists are each scoped to that slice's own `base=$(git rev-parse HEAD)`, so the planner's
own commits (including a revision of this packet file) cannot break them.

## 6. Rehearsed observations

Every red, green and fault below was produced in a private worktree of
`7a2f25efc21156c86fa0b02389fb68039bd76e96`, against the final listings in section 10; restore a
mutated file from a copy under `"$TMPDIR"` and prove it with `cmp` before asserting on any captured
status.

| #   | Where                                                                                                              | Fault injected                                                                                                                                                                                                                                               | Test that observed it                                                                                                                                       | Literal fragment observed                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 1 red, on the unchanged tree                                                                                 | none; `contract.ts`, `module.ts` and `check.ts` do not exist yet                                                                                                                                                                                             | `module.test.ts`                                                                                                                                            | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                                                                                                                                        |
| 2   | slice 1 green, first attempt                                                                                       | all module files written                                                                                                                                                                                                                                     | `module.test.ts`, `login-throttle.test.ts`                                                                                                                  | `11 pass`, `0 fail`, `16 expect() calls` across 2 files; `wbs-core:lint,typecheck --skip-nx-cache` both exit 0 on the first attempt, no autofix needed                                                                                                                                                                                                                                       |
| 3   | `module.ts`'s single `buildModule` call, the key tuple                                                             | `['auth', 'loginThrottle', 'authOptions']` — the `authOptions` binding alone widened                                                                                                                                                                         | `keeps its authOptions binding out of a host graph`, `labels its private bindings with the module name`                                                     | `resolve('authOptions')` returned the raw `AuthServiceOptions` object instead of throwing; `inspectGraph()` reported bare `authOptions`. `7 pass`, `2 fail`. `keeps its throttleOptions binding out of a host graph` and `names itself when a host omits a requirement` stayed GREEN, proving the two private bindings are independent.                                                      |
| 3b  | `module.ts`, restored, then the same call                                                                          | `['auth', 'loginThrottle', 'throttleOptions']` — the `throttleOptions` binding alone widened                                                                                                                                                                 | `keeps its throttleOptions binding out of a host graph`, `labels its private bindings with the module name`, `names itself when a host omits a requirement` | `6 pass`, `3 fail`. `keeps its authOptions binding out of a host graph` stayed GREEN.                                                                                                                                                                                                                                                                                                        |
| 4   | `module.ts`, restored, then the label argument alone                                                               | `{ label: AUTHENTICATION_LABEL }` removed                                                                                                                                                                                                                    | the two label-bearing assertions                                                                                                                            | `inspectGraph()` reported both bindings unlabelled; the missing-requirement message named bare `throttleOptions`. `7 pass`, `2 fail`                                                                                                                                                                                                                                                         |
| 5   | `check.ts`, `installAuthentication`'s single `return`                                                              | `const exposed = { auth: bag.resolve('auth'), loginThrottle: bag.resolve('loginThrottle'), bag }; return exposed;` — structurally assignable (returning the object literal directly instead fails `wbs-core:typecheck` with TS2353 and is not a valid fault) | `exposes only the contract exports from its installer`, its FIRST assertion                                                                                 | `Object.keys(exposed)` reported `["auth", "bag", "loginThrottle"]` against `["auth", "loginThrottle"]`; `8 pass`, `1 fail`; `wbs-core:typecheck` exits 0                                                                                                                                                                                                                                     |
| 6   | `check.ts`, the same `return`, made type-correct                                                                   | `auth: Object.assign(bag.resolve('auth'), { resolve: bag.resolve.bind(bag) })`                                                                                                                                                                               | the same test, its SECOND assertion                                                                                                                         | `Expected: true`, `Received: false`; `8 pass`, `1 fail`. `wbs-core:typecheck` **still exits 0** on this mutation, which is why the enumeration test exists                                                                                                                                                                                                                                   |
| 7   | `contract.ts`'s own `account.users` intersection member                                                            | `NonNullable<AuthServiceOptions['identities']>` removed from the `users` type (leaving only `AuthServiceOptions['users']`)                                                                                                                                   | the compile-negative test's own `@ts-expect-error` (`verifierWithoutStore`)                                                                                 | `wbs-core:typecheck` failed with `TS2578: Unused '@ts-expect-error' directive` at the fixture — the insufficient `UserStore`-only store then satisfied the (weakened) requirement — **plus** expected collateral `TS2741: Property 'resolveOidcIdentity' is missing in type 'UserStore'` at `module.ts`'s own `authOptions` factory, which also narrows through the same intersection member |
| 8   | `use-cases/run-command-batch.ts`, injected import                                                                  | `import type { AuthenticatedUser } from '../module/authentication/authentication.feature';` prepended                                                                                                                                                        | `rejects the checked sideways-type import routes`                                                                                                           | `[ "use-cases/run-command-batch.ts: '../module/authentication/authentication.feature' reaches module/authentication/authentication.feature.ts" ]`; `0 pass`, `1 fail`. Reproduced with the four pre-existing `service/auth.service.ts` rows unchanged, proving the gap they leave.                                                                                                           |
| 9   | `module/bounded-replay-sweep/retention-timer.ts`, injected import, independently (restored from row 8 first)       | `import type { AuthenticatedUser } from '../authentication/authentication.feature';` prepended                                                                                                                                                               | same test                                                                                                                                                   | `[ "module/bounded-replay-sweep/retention-timer.ts: '../authentication/authentication.feature' reaches module/authentication/authentication.feature.ts" ]`; `0 pass`, `1 fail`                                                                                                                                                                                                               |
| 10  | `module/realtime/gateway-broadcaster.ts`, injected import, independently                                           | same import prepended                                                                                                                                                                                                                                        | same test                                                                                                                                                   | `[ "module/realtime/gateway-broadcaster.ts: '../authentication/authentication.feature' reaches module/authentication/authentication.feature.ts" ]`; `0 pass`, `1 fail`                                                                                                                                                                                                                       |
| 11  | `module/plan-import/plan-import.feature.ts`, injected import, independently                                        | same import prepended                                                                                                                                                                                                                                        | same test                                                                                                                                                   | `[ "module/plan-import/plan-import.feature.ts: '../authentication/authentication.feature' reaches module/authentication/authentication.feature.ts" ]`; `0 pass`, `1 fail`                                                                                                                                                                                                                    |
| 12  | `module/authentication/authentication.feature.ts` itself, injected import                                          | `import type { Identity } from '../../http/endpoint';` prepended                                                                                                                                                                                             | same test                                                                                                                                                   | both a module-specifier and identifier violation reaching `http/endpoint.ts`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                             |
| 13  | slice 2, `compose.test.ts`'s new negative, on the UNCHANGED `compose.ts` (test-first, review 1's own Important 5)  | none — the test hunk applied alone, before any composition-root edit                                                                                                                                                                                         | `wbs-core:typecheck`; `bun test compose.test.ts -t "accountless composition has no auth capability"`                                                        | `TS2578: Unused '@ts-expect-error' directive` (1 error); at runtime, a real `LoginThrottle` instance instead of `undefined` (0 pass, 1 fail)                                                                                                                                                                                                                                                 |
| 14  | slice 3, wiki-policy parity — `modules.json` alone given the new row, `policy.json` unchanged                      | none; a genuine partial-registration step                                                                                                                                                                                                                    | `pins exact pre-index tuples and passes observe lint from external trust`                                                                                   | `pilot-policy.test.ts:374`'s own `expect(modules.length).toBe(policy.boundaries.length)`: `Expected: 9`, `Received: 10`                                                                                                                                                                                                                                                                      |
| 15  | slice 3, wiki-policy discovered-index — `policy.json`'s boundary added too, `pilotPaths`/README still unregistered | none; the next genuine partial-registration step                                                                                                                                                                                                             | same test                                                                                                                                                   | `pilot-policy.test.ts:411`: `Expected: true`, `Received: false` (25 of the test's own assertions passed first)                                                                                                                                                                                                                                                                               |
| 16  | slice 3, green — `pilotPaths` and the final README added                                                           | none                                                                                                                                                                                                                                                         | the whole `pilot-policy.test.ts` file                                                                                                                       | `21 pass`, `0 fail`, `297 expect() calls` (up from the pre-registration `296`)                                                                                                                                                                                                                                                                                                               |
| 17  | slice 3, legacy-pin, on the unchanged pin literal (rerun AFTER registration, BEFORE the re-pin edit)               | none; the registration edit alone moves the count                                                                                                                                                                                                            | `every legacy source occurrence and relevant text family is pinned`                                                                                         | `historical policy selector or baseline` `45`→`47`, `occurrences` `263`→`265`, digest `a3db8f97…`→`3eca3cf1…`, printed as `Expected  - 3` / `Received  + 3`; `0 pass`, `1 fail`. Applying the numeric update restores `1 pass`.                                                                                                                                                              |
| 18  | **planner-only**, a first-draft README naming the pre-namespacing directory literally                              | `libs/core/src/service/auth.service.ts` spelled out in the README's own "Wiki registration" prose                                                                                                                                                            | `tool-devsync:test`, the whole target                                                                                                                       | `current documentation and active solver packets use namespaced roots` reported that document's own `:libs/core/` four times against an expected empty array. Rewriting the prose to name the file by its filename only restored green.                                                                                                                                                      |

Each assertion has a mutation that names it. Faults 3 and 3b are independent (each leaves the
OTHER private binding's own assertions green), closing review 1's own concern that two private
bindings shared one fault. Fault 5 fails only the installer test's first assertion (the leaked key
stops the second from running); fault 6 leaves the key list correct and fails only the second.
Faults 8 through 11 are four independent proofs of the SAME new-real-path gap, one scope at a time,
restored between each — closing review 1's own Important 6. Fault 12 is the module's own
`http/endpoint.ts` row, independent of all four. Fault 13 is the mandatory test-first red review 1's
own Important 5 requires: observed BEFORE any composition-root implementation, not offered as an
optional follow-up. Faults 14 through 17 are the real registration sequence, not a withheld
impossibility finding — a genuine parity red, a genuine discovered-index red, then green, then the
legacy-pin's own red-then-repin. Fault 18 is planner-only (performed once during this packet's own
authoring, not an executor obligation) and is why the final README (section 10.8) never spells out
the pre-namespacing directory.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses as `if cmd >"$log" 2>&1; then status=0; else status=$?; fi;
printf 'exit=%s\n' "$status" >>"$log"`; never read a status through `tee` and never `|| true`.
Scratch only under `"$TMPDIR"`, mutation patches and failing output under `"$TMPDIR/evidence"`;
evidence references in `verify.md` are basenames relative to that directory, never absolute clone,
home or temporary paths. The executor never runs `git add`, `git commit` or any other Git-state
command — every relocation below is a filesystem operation the executor performs directly (`mv`,
`cp`), never `git mv`; the planner is the one who stages and commits with Git's own rename
detection. A working-tree mutation for a negative proof is injected by editing the file directly,
observed, then restored with `cp` from a `"$TMPDIR"` copy and proved with `cmp`. **Every step 0
below opens with `base=$(git rev-parse HEAD)`, recorded before any read or edit**; every count this
packet compares (`C`, `F`, `K`, `M`, `B`, `T`/`TF`/`P`, `N`) is explicitly assigned in the slice that
first needs it, never assumed to survive from an earlier slice's own shell.

### Slice 1 — Seal Authentication as a DI Bag module

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD)
test ! -d libs/wbs/application/core/src/module/authentication && echo "gate: module absent"
test -f libs/wbs/application/core/src/service/auth.service.ts
wc -l < libs/wbs/application/core/src/service/auth.service.ts
test -f libs/wbs/application/core/src/service/login-throttle.ts
wc -l < libs/wbs/application/core/src/service/login-throttle.ts
test -f libs/wbs/application/core/src/service/login-throttle.test.ts
NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core --skip-nx-cache
```

Expect the gate line, `178`, `152`, then exit 0. Record this slice's own whole-core baseline:

```sh
(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/slice1-core-baseline.log" 2>&1
echo "exit=$?"
tail -4 "$TMPDIR/evidence/slice1-core-baseline.log"
```

Call that pass count `C` and file count `F`. Observed on the rehearsed tree: `561 pass`, `0 fail`,
58 files. The end of this slice requires `C + 9` and `F + 1`, never an absolute number —
`module.test.ts` adds 9 tests; `login-throttle.test.ts`'s own 2 tests move with it and are already
counted in `C`.

Tests first, then the implementation, both inside this one slice:

1. Create `libs/wbs/application/core/src/module/authentication/module.test.ts` from section 10.1
   verbatim and run it. Expect row 1's red: `error: Cannot find module './check'`, `0 pass`,
   `1 fail`, `1 error`. This red is evidence, not a commit.
2. Relocate the three files:
   - `mkdir -p libs/wbs/application/core/src/module/authentication`
   - `cp libs/wbs/application/core/src/service/auth.service.ts
libs/wbs/application/core/src/module/authentication/authentication.feature.ts`, then edit the
     copy's own import lines one directory level deeper (`from '../ports/...'` →
     `from '../../ports/...'`, section 10.2 shows all four exact lines) — **do not delete the
     original** yet.
   - `cp libs/wbs/application/core/src/service/login-throttle.ts
libs/wbs/application/core/src/module/authentication/login-throttle.ts` — no import edit (it
     imports nothing); **do not delete the original** yet.
   - `mv libs/wbs/application/core/src/service/login-throttle.test.ts
libs/wbs/application/core/src/module/authentication/login-throttle.test.ts` — a real
     filesystem move, its own two tests must exist at exactly one path; no import edit needed (both
     files move to the same new directory). **This deletion is explicitly authorized:** unlike the
     two production files, `login-throttle.test.ts` has no external deep-import consumer, so no
     shim is needed at its old path.
   - Replace `service/auth.service.ts`'s own content with the shim of section 10.3; same for
     `service/login-throttle.ts`. `apps/wbs/be-01/src/service/auth.service.ts` and
     `.../login-throttle.ts` deep-import `@wbs/core/service/auth.service` and
     `@wbs/core/service/login-throttle`, which resolve to these exact paths via the `@wbs/core/*`
     wildcard mapping, so both shim files must remain real files at their own paths.
3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` from section 10.4. The README at
   this point carries no `<!-- module-index -->` block and no "Wiki registration" section — only
   title prose, "## Checks" and "## Consumers".
4. `bun test ./libs/wbs/application/core/src/module/authentication/` → exit 0, `11 pass`, `0 fail`,
   `16 expect() calls` across 2 files (observed).
5. `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → expect exit
   0 for both lint and typecheck on the first attempt: section 10's exact listings are already
   sorted and Prettier-clean. Preamble rule 17 (only `simple-import-sort/imports`,
   `simple-import-sort/exports` and `prettier/prettier`, fixed with `bunx eslint --fix` and a
   rerun) remains available **if** the executor's own transcription drifts from section 10's exact
   listing, but is not itself an expected outcome. Any diagnostic outside that rule's own scope is
   a stop: report it rather than repairing code this packet did not itself prescribe.
6. Apply section 10.5's diff to `ports/sideways-type-boundaries.test.ts`: add five new rows. This
   is a pure addition, not a rename: four existing rows already target `service/auth.service.ts`
   (the compatibility shim path, preparation 4's own rows) and are left completely unchanged — the
   five new rows cover Authentication's new real implementation path,
   `module/authentication/authentication.feature.ts`, which none of the four shim-path rows reach.
   Rerun `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` → exit 0,
   `1 pass`.
7. Rehearse the negatives, **each restored and `cmp`-proved before the next**:
   - Rows 3 and 3b: widen `module.ts`'s key tuple to add `authOptions` alone, observe row 3's
     split (`7 pass`, `2 fail`, the OTHER binding's own assertions still green); restore, `cmp`-prove;
     widen to add `throttleOptions` alone, observe row 3b's split (`6 pass`, `3 fail`); restore,
     `cmp`-prove.
   - Row 4: drop `{ label: AUTHENTICATION_LABEL }`, observe `7 pass`, `2 fail`; restore, `cmp`-prove.
   - Rows 5 and 6: the two `check.ts` leaks, each its own mutation, each restored and `cmp`-proved
     before the next.
   - Row 7: remove `NonNullable<AuthServiceOptions['identities']>` from `contract.ts`'s own
     `account.users` intersection, observe `wbs-core:typecheck` fail with `TS2578: Unused
'@ts-expect-error' directive` at `module.test.ts`'s compile-negative fixture — **and**, as
     expected collateral from the same edit, `TS2741: Property 'resolveOidcIdentity' is missing in
type 'UserStore' but required in type 'OidcIdentityStore'` at `module.ts`'s own `authOptions`
     factory (the narrowed `users` alone no longer satisfies `AuthServiceOptions['identities']`
     there either); restore, `cmp`-prove, rerun typecheck green with both diagnostics gone.
   - Rows 8 through 11: the same one-line import prepended into
     `use-cases/run-command-batch.ts`, then (independently, restored between each)
     `module/bounded-replay-sweep/retention-timer.ts`,
     `module/realtime/gateway-broadcaster.ts` and
     `module/plan-import/plan-import.feature.ts` — each observed alone, restored and `cmp`-proved
     before the next.
   - Row 12: `module/authentication/authentication.feature.ts` itself importing
     `Identity` from `http/endpoint.ts`; restore, `cmp`-prove, rerun green.

   Add the dated `Proof:` comments only now, after observation. `module.test.ts`'s own
   compile-negative fixture (section 10.1) already carries a placeholder noting the comment is
   added here — replace that placeholder with:

   ```ts
   * Proof (2026-09-23): removing `NonNullable<AuthServiceOptions['identities']>`
   * from `AuthenticationRequirements['account']`'s own `users` intersection
   * made this directive fail `wbs-core:typecheck` with "Unused '@ts-expect-error'
   * directive" at the fixture (TS2578) and, as expected collateral, with
   * "Property 'resolveOidcIdentity' is missing in type 'UserStore'" at
   * `module.ts`'s own `authOptions` factory (TS2741) — the insufficient store
   * then satisfied the requirement at runtime.
   ```

   Also add two beside `module.ts`'s `buildModule` call (rows 3 and 3b — the widened-tuple fault;
   the label-drop fault gets its own comment too) and two beside `check.ts`'s `return` (rows 5 and
   6), each naming its own observed fragment.

   `sideways-type-boundaries.test.ts`'s own JSDoc above `routes` (section 10.5) already carries a
   placeholder noting these five comments are added here — replace that placeholder with, in order:

   ```ts
    * Proof (2026-09-23): importing `type { AuthenticatedUser } from
    * '../module/authentication/authentication.feature'` into `use-cases/run-command-batch.ts`
    * failed this suite with `"use-cases/run-command-batch.ts:
    * '../module/authentication/authentication.feature' reaches
    * module/authentication/authentication.feature.ts"` (0 pass, 1 fail) — reproduced
    * with the four pre-existing `service/auth.service.ts` rows unchanged, proving the gap
    * they leave.
    * Proof (2026-09-23): independently importing `type { AuthenticatedUser } from
    * '../authentication/authentication.feature'` into
    * `module/bounded-replay-sweep/retention-timer.ts` failed this suite with
    * `"module/bounded-replay-sweep/retention-timer.ts: '../authentication/authentication.feature'
    * reaches module/authentication/authentication.feature.ts"` (0 pass, 1 fail).
    * Proof (2026-09-23): independently importing the same type into
    * `module/realtime/gateway-broadcaster.ts` failed this suite with
    * `"module/realtime/gateway-broadcaster.ts: '../authentication/authentication.feature' reaches
    * module/authentication/authentication.feature.ts"` (0 pass, 1 fail).
    * Proof (2026-09-23): independently importing the same type into
    * `module/plan-import/plan-import.feature.ts` failed this suite with
    * `"module/plan-import/plan-import.feature.ts: '../authentication/authentication.feature'
    * reaches module/authentication/authentication.feature.ts"` (0 pass, 1 fail).
    * Proof (2026-09-23): importing `type { Identity } from '../../http/endpoint'` into
    * `module/authentication/authentication.feature.ts` itself failed this suite with both a
    * module-specifier and an identifier violation — `"module/authentication/authentication.feature.ts:
    * '../../http/endpoint' reaches http/endpoint.ts"` and `"…: Identity reaches http/endpoint.ts"`
    * (0 pass, 1 fail).
   ```

8. Tick nothing yet — `tasks.md` 3.5 ticks in slice 3.
9. Append to `openspec/changes/adopt-di-composition/verify.md`: `base`, `C`, `F`, every module
   fault (rows 3, 3b, 4, 5, 6, 7) with their literal fragments, every sideways-boundary fault (rows
   8 through 12), the evidence basenames, and one line naming `contract.ts`'s own preserved K3 debt
   (`AuthService` directly calls `users.create`/`findByUsername`/`findById` and
   `identities.resolveOidcIdentity`, repository ports, tracked under task 7.4 — matching Plan
   import's own contract; the K3 debt is disclosed, never claimed absent).
10. Only now the closing checks: `(cd libs/wbs/application/core && bun test src)` → exit 0 with
    `C + 9` passes over `F + 1` files (observed `570 pass`, `0 fail`, 59 files); then
    `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → exit 0; then
    `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `refactor(core): seal Authentication as a DI Bag module`. The executor's own step 2
already moved `login-throttle.test.ts` on the filesystem, so its old path no longer exists — the
planner never runs `git mv` (there is nothing left at the source to rename). The planner instead
stages the working tree as found: `git add` the new path (an addition) and the now-missing old path
(a deletion, picked up by `git add -A` or an explicit `git rm --cached` of the stale index entry).
Git's own rename detection reports this addition/deletion pair as a rename from the staged
snapshot alone — no explicit `git mv` command is ever issued for it. The two production files are
tracked as ordinary content replacements at their old paths plus two new files at the new path, not
as detected renames (their own content differs at the new path by the import-depth edit). Section
12 gives this slice's exact hand-over path list, `verify.md`'s append included.

### Slice 2 — Compose Authentication from its sealed module

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD)
test -f libs/wbs/application/core/src/module/authentication/module.ts && echo "gate: slice 1 landed"
test -f libs/wbs/application/core/src/compose.ts
grep -cF "new AuthService({" libs/wbs/application/core/src/compose.ts
grep -cF "new LoginThrottle({" libs/wbs/application/core/src/compose.ts
test -f docs/code-organization/kinds.json
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect the gate line, `1`, `1`, then a number; call it `K` and record it (observed `95`; the end of
this slice requires `K`, unchanged, never an absolute figure). Record this slice's own whole-core
baseline the way slice 1 does and call the pass count `C` and the file count `F` (observed `C=570
pass`, `F=59` files, after slice 1). The end of this slice requires both `C` and `F` unchanged,
never an absolute figure — this slice adds no new test file, only two new assertions inside
`compose.test.ts`'s two existing tests.

Record two more pre-edit baselines, before any edit below:

```sh
NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache
```

Expect exit 0 for both.

**Test-first (review 1's own Important 5): apply the test hunk, observe red, only then implement.**

1. Apply section 10.6's `compose.test.ts` hunk alone (the new `@ts-expect-error`/
   `graph.loginThrottle` negative in the accountless test, without its own `Proof:` comment yet,
   and the new `graph.loginThrottle.canAttempt(...)` assertion in the accountful test) to the
   UNCHANGED `compose.ts`. Run `NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache` →
   expect it to FAIL with exactly `TS2578: Unused '@ts-expect-error' directive` at the new
   directive, one error. Run
   `bun test ./libs/wbs/application/core/src/compose.test.ts -t "accountless composition has no
auth capability"` → expect it to FAIL at runtime: `graph.loginThrottle` is a real `LoginThrottle`
   instance, not `undefined` (`0 pass`, `1 fail`). Both reds are evidence, not a commit.
2. Only now apply section 10.6's `compose.ts` diff: import `installAuthentication` and the
   `AuthService`/`LoginThrottle` **types** from the new module path (dropping the value imports
   from `./service/auth.service` and `./service/login-throttle`), move `loginThrottle` off the
   `CommonServices` interface onto `AccountfulServices` (alongside `auth`), and replace
   `new AuthService({...})` and `new LoginThrottle({...})` with one
   `installAuthentication({ account: {...}, now, maxConcurrentLogins })` call whose destructured
   `{ auth, loginThrottle }` is spread into the accountful return — `account` drops the separate
   `identities: source.stores.users` field the old constructor call had (the module now derives it),
   every other field unchanged.
3. Apply section 10.6's `index.ts` diff: two new export lines in sorted position.
4. Apply section 10.7's diff to `kinds.json`: the two rows for `service/auth.service.ts` and
   `service/login-throttle.ts` rewritten in place to the `re-export shim;` disposition; no row
   added for any file under `module/authentication/`, and none removed.

| Command                                                                                                                                                         | Expect                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core --skip-nx-cache`                                                                      | exit 0 (observed clean on the first attempt)                                                                                                                                                               |
| `bun test ./libs/wbs/application/core/src/compose.test.ts`                                                                                                      | exit 0, `8 pass`, `0 fail`, `28 expect() calls` (observed)                                                                                                                                                 |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`                                                                                           | exit 0                                                                                                                                                                                                     |
| `test -f dist/libs/wbs/application/core/portable-composition.js && grep -c "application.authentication" dist/libs/wbs/application/core/portable-composition.js` | at least `1`                                                                                                                                                                                               |
| `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                                                                               | exit 0, unchanged from the be-01-typecheck baseline above                                                                                                                                                  |
| `(cd libs/wbs/application/core && bun test src)`                                                                                                                | exit 0, `C` passes, `0 fail` over `F` files (this slice adds no new test file, only two new assertions inside `compose.test.ts`'s two existing tests — expect() count rises from 1,843 to 1,845, observed) |
| `test -f docs/code-organization/kinds.json && python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"`             | `K`, the step-0 value, unchanged                                                                                                                                                                           |

Now, and only now, insert this exact comment directly above the `@ts-expect-error` line added in
step 1 (immediately after `expect(graph.auth).toBeUndefined();`), naming what step 1 actually
observed:

```ts
// Proof (2026-09-23): on the unchanged tree (`loginThrottle` still on `CommonServices`,
// constructed unconditionally), this directive's own `@ts-expect-error` failed
// `wbs-core:typecheck` with `TS2578: Unused '@ts-expect-error' directive` (1 error), and the
// runtime assertion below failed with a real `LoginThrottle` instance instead of `undefined`
// (0 pass, 1 fail). Moving `loginThrottle` onto `AccountfulServices` and installing it only
// in the accountful branch restored both to green.
```

Tick nothing in `tasks.md` here either. Append to `openspec/changes/adopt-di-composition/verify.md`:
`base`, `K`, `C`, `F`, the two step-1 reds with their literal diagnostics, the portable-bundle grep
result, the be-01-typecheck baseline (pass/fail only), and the closing counts (`C` and `F` both
unchanged). Only after those appends: `GSETTINGS_BACKEND=memory bunx nx format:check --all` →
exit 0.

Planner commit: `refactor(core): compose Authentication from its sealed module`. Section 12 gives
this slice's exact hand-over path list, `verify.md`'s append included.

### Slice 3 — Register Authentication's sealed module in the wiki content-review pilot

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD)
git log -1 --format=%H -- libs/wbs/application/core/src/module/authentication/module.ts
test -f docs/wiki-policy/modules.json
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
test -f docs/wiki-policy/policy.json
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/auth.service.ts
```

Expect a commit hash, then two equal counts — call them `M` and `B` (observed `9` and `9`) — then
**one tuple** from the `git ls-tree` line, blob `73c84b20a377349c4fd215cb90a4807ef3370267`. If that
line prints nothing, stop: this packet's own central finding (section 3) is wrong for the checkout
in hand.

Also run, before any edit, this slice's own baselines for the four checks this slice's own edits
now touch (review 1's own Important 7 — this slice edits files under both `apps/wiki/cli/src` and
`tools/tool-devsync/src`, unlike every prior 040.6 module's own slice 3):

```sh
NX_DAEMON=false bunx nx run-many -t typecheck -p tool-devsync,twilight-burokrat --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
```

Expect exit 0 for all four (observed).

Run the pilot suite and record its own baseline `T`/`TF`/`P`:

```sh
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 600 bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)
```

Observed on the rehearsed tree: `21` tests, `0` failures, `296` `expect()` calls
(historical, never an absolute requirement — the executor records its own `T`/`TF`/`P`). Give it a
generous timeout; it spawns the CLI many times (~320s observed).

Run the legacy-pin test alone and record its own current pin as a baseline, before any edit:

```sh
bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "every legacy source occurrence"
```

Expect `1 pass`. Also run the "OpenSpec validation" standard block (§2) once, before any edit, and
record `N` (observed `114`).

**Registration, in the order it must be rehearsed — a genuine parity red, then a genuine
discovered-index red, then green (review 1's own Critical 3).**

1. Add one row to `docs/wiki-policy/modules.json` (section 10.9's diff, `modules.json` half): a
   `module.application.authentication` entry, `memberships` a single `directory-prefix` over
   `libs/wbs/application/core/src/module/authentication`, `indexPath` its own README,
   `externalConsumers` the same four paths the README's own module-index block declares. Insert it
   in sorted position, immediately before `module.application.bounded-replay-sweep`.
2. Rerun the pilot suite's own single test:
   `bun test ./apps/wiki/cli/src/policy/pilot-policy.test.ts -t "pins exact pre-index tuples"` →
   expect the PARITY red: `Expected: 9`, `Received: 10` at `pilot-policy.test.ts:374`'s own
   `expect(modules.length).toBe(policy.boundaries.length)`.
3. Add one boundary to `docs/wiki-policy/policy.json` (section 10.9's diff, `policy.json` half): a
   `boundary.application.authentication` entry, `selector` a `prefix` over the module's own
   directory, `sourceSelector` a `prefix` over `libs/core/src/service/auth.service.ts` alone (kind
   MUST match `selector`'s own kind — a `path`/`prefix` mismatch is refused before either the
   empty-baseline or structural check runs), `baselineEntries` the single tuple from step 0's own
   `git ls-tree`. Append it after `boundary.application.realtime`.
4. Rerun the same single test → expect the DISCOVERED-INDEX red:
   `pilot-policy.test.ts:411`'s own `Expected: true`, `Received: false` — 25 of the test's own
   assertions pass first (parity and the structural baseline comparison both now succeed).
5. Add `libs/wbs/application/core/src/module/authentication/README.md` to `pilotPaths` (section
   10.9's diff, `pilot-policy.test.ts` half), in sorted position immediately before
   `.../module/bounded-replay-sweep/README.md`. Replace the module's own README content with
   section 10.8's final form — the `<!-- module-index -->` block and the "Wiki registration"
   section describing the successful registration, **never spelling out the pre-namespacing
   directory literally** (row 18 of section 6). `GSETTINGS_BACKEND=memory bunx prettier --write` it
   then `--check` it; expect exit 0 both times.
6. Rerun the whole `pilot-policy.test.ts` file → expect GREEN: `21` tests, `0` failures, `297`
   `expect()` calls — one more than the step-0 baseline `P` (the per-boundary
   `expect(boundary.baselineEntries).toEqual(...)` loop at `pilot-policy.test.ts:342-348` now runs
   once per boundary over ten boundaries instead of nine, never an absolute figure).
7. Rerun the legacy-pin test alone, with the pin still unchanged from step 0:
   `bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "every legacy source
occurrence"` → expect the RED this registration itself now causes, at
   `tools/tool-devsync/src/repo-namespacing-handoff.test.ts:612`'s own
   `expect(await legacySourceOccurrences()).toEqual({...})`: the diff reports
   `"historical policy selector or baseline"` moving from `45` to `47`, `"occurrences"` from `263`
   to `265`, and `digest` from `a3db8f9766fa58137d1067c35e0628fd9020100aac871e07c0137a28ac772cd4`
   to `3eca3cf1a2f8d1703b42edfd40be279a5a144034c000a812d7b70eb8b2cfef62`, printed as
   `Expected  - 3` / `Received  + 3`; `0 pass`, `1 fail`. This red is evidence that the registration
   alone moves the pin; save it. Only now apply section 10.10's diff (the numeric update to
   `47`/`265` and the digest, plus the Proof comment describing exactly this observed red) and
   rerun the same command → expect `1 pass`. This is the ONLY permitted edit to a pinned literal in
   that file; report a stop if any OTHER pinned count in it also moved.
8. Apply section 10.11's diff to `openspec/changes/adopt-di-composition/tasks.md`: tick 3.5 and
   extend 7.5's own running note recording the registration and the withdrawal of the prior
   revision's impossibility finding.
9. Rerun the four baselines from step 0 (`tool-devsync`/`twilight-burokrat` typecheck,
   `twilight-burokrat:lint:source`, `tool-devsync:lint`) → expect exit 0 for all four, unchanged.
10. Rerun the "OpenSpec validation" standard block → expect exit 0, `passed` equal to `N`, `failed`
    equal to `0`.
11. `NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache` → exit 0 (this slice edits no
    TypeScript source under `libs/wbs/application/core`).
12. Append to `openspec/changes/adopt-di-composition/verify.md`: `base`, `M`, `B`, the frozen-revision
    tuple, the parity red, the discovered-index red, the green result, the legacy-pin red-then-repin,
    the four `apps/wiki/cli`/`tools/tool-devsync` baselines (unchanged before/after), `N`, and the
    evidence basenames.
13. `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `docs(core): register Authentication's sealed module in the wiki content-review pilot`.
Section 12 gives this slice's exact hand-over path list, `verify.md`'s append included.

**Planner-only, after this slice's own commit.** `bun run apps/wiki/cli/src/cli.ts check-indexes
committed <repository> <this slice's own commit SHA>` validates that the production index-discovery
mechanism (`checkIndexes`, `apps/wiki/cli/src/cli.ts:178`) finds this module's own index correctly —
**this is index validation, not a verification of the separate `MOD-LAYOUT` rule
(`moduleLayoutObservations`, `apps/wiki/cli/src/rules/kinds.ts:136`), which `check-indexes` does not
invoke** (review 1's own Important 9). Rehearsed against this packet's own commit `cdbed163`: the
report's 13 `indexes` include one with
`"indexPath": "libs/wbs/application/core/src/module/authentication/README.md"`,
`"moduleId": "module.application.authentication"` and all seven module files as `members`, with
zero `reviewDebt` entries naming it.

## 8. Planner-only checks

| Check                                                                                              | Why it is the planner's                                                                                                                                                                         | Value observed on the rehearsed tree                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-be-01:test:unit`                                                  | One be-01 unit file binds a TCP port (packet A's own finding); nothing in this packet needs loopback, so the target moves, not the dispatch.                                                    | `519 pass`, `0 fail`, 49 files                                                                                                                                                                                                                                                      |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`                                    | Writes Git objects over the working tree; the executor's clone is read-only.                                                                                                                    | `366 pass`, `0 fail`, 25 files                                                                                                                                                                                                                                                      |
| `NX_DAEMON=false bunx nx run wbs-core:test`                                                        | Whole-target integration verification with coverage; runs the same files `test:unit` discovers and no core test binds a port.                                                                   | `570 pass`, `0 fail`, 59 files                                                                                                                                                                                                                                                      |
| `NX_DAEMON=false bunx nx run wbs-be-01:test`                                                       | Opens SQLite databases as a whole target.                                                                                                                                                       | `1091 pass`, `1 skip`, `0 fail`, 92 files                                                                                                                                                                                                                                           |
| `NX_DAEMON=false bunx nx run wbs-core:test:portable`                                               | Runs Playwright; the executor has no browser.                                                                                                                                                   | pending planner verification                                                                                                                                                                                                                                                        |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test`                                               | Whole listener-test target; `apps/wiki/cli/project.json:23` explicitly excludes `packaging/install.test.ts` and `packaging/consumer-bootstrap.test.ts` from it, so it does not cover packaging. | observed passing when run in isolation (a shared `.contract-test-scratch/` fixture directory under `apps/wiki/cli/src/contracts` can collide when this target runs concurrently with another test process on the same host — not a defect of this packet's own edits; run it alone) |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test:package --skip-nx-cache`                       | The excluded packaging suite; no slice of this packet touches packaging.                                                                                                                        | pending planner verification                                                                                                                                                                                                                                                        |
| `bin/h2puni-gate.sh <sha>`                                                                         | Takes the host-wide heavy lock.                                                                                                                                                                 | pending planner verification                                                                                                                                                                                                                                                        |
| `bun run apps/wiki/cli/src/cli.ts check-indexes committed <repository> <slice 3's own commit SHA>` | Index-discovery validation (see slice 3's own closing note); not a MOD-LAYOUT check.                                                                                                            | rehearsed against commit `cdbed163`: 13 indexes, one `moduleId: "module.application.authentication"` with all seven files as `members`, `reviewDebt` empty                                                                                                                          |

This table supplements the mandatory full "Integration verification" matrix in the batch-1 README;
it does not replace that matrix.

Unlike every prior 040.6 module's own slice 3 EXCEPT Realtime's, this packet's own slice 3 touches
`apps/wiki/cli/src` and `tools/tool-devsync/src` directly (the registration itself), so
`tool-devsync:typecheck`, `tool-devsync:lint`, `twilight-burokrat:typecheck` and
`twilight-burokrat:lint:source` are this slice's OWN baselines (section 7 slice 3's own step 0),
not pure planner-only checks — the table above still lists the whole-target rows for completeness.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once; do not edit that test or any other test this packet does not name.

## 9. What the next 040.6 packets should be

1. **Next — Saved plans.** Still blocked on task 1.7 (`saved-plan-retry.ts`: "wire or delete … under
   the accepted saved-plans obligation") before its own extraction packet can start; resolve that
   first.
2. **Optimization** stays last: preparations 1.5 and 1.6's second half are still open, and it lives
   under `apps/wbs/be-01`, so its wiki registration will need a `module.backend.optimization`
   identifier rather than `module.application.*`. Measure its own predecessor(s) the same way this
   packet did (section 3): check `git ls-tree` at the frozen revision for each of its own files, and
   remember that 7.5's own guarantee is one predecessor per module DIRECTORY — a module with several
   collaborator files needs only its OWN feature file's predecessor, following Realtime's and this
   packet's own precedent, not a selector covering every file.
3. **The K2 delivery-orchestration move the map names for Authentication remains open and is not a
   040.6 packet on its own.** Moving `LoginThrottle.reserve`/`recordFailure`/`recordSuccess`/release
   out of `apps/wbs/be-01/src/controller/auth-password-endpoints.ts` and into the Authentication
   feature surface is real, additional scope this packet's own non-goals name and do not attempt.
   `LoginThrottle` already has interleaving concerns (`reserve`'s own concurrent admission, `prune`'s
   own eviction) that a future packet moving its call sites should treat as lifecycle/admission
   logic under the addendum's own point 15/16 discipline, not as a simple relocation.

## 10. Exact content

### 10.1 `module.test.ts` (slice 1, step 1)

```ts
import { inMemoryUsers } from '@wbs/store-memory/auth-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import type { OidcVerifier } from '../../ports/oidc-verifier';
import type { PasswordHasher, SessionClaims, TokenCodec } from '../../ports/runtime';
import type { OidcIdentityStore, UserStore } from '../../ports/user-store';
import { installAuthentication } from './check';
import type { AuthenticationRequirements } from './contract';
import { AUTHENTICATION_LABEL } from './contract';
import { authenticationModule } from './module';

const STAMP_AT = 1_757_851_200_000;

/**
 * A deterministic, non-cryptographic pair, in place of `Bun.password` and
 * `jose`: the module's own tests are about the DI graph and the admission
 * throttle, not about argon2id or JWT — `apps/wbs/be-01/src/testing/auth-fixture.ts`'s
 * own real adapters are app-layer and this module's tests cannot reach them
 * without a reverse, lib-imports-app edge.
 */
const fakePasswords: PasswordHasher = {
  hash: (password) => Promise.resolve(`hashed:${password}`),
  verify: (password, hash) => Promise.resolve(hash === `hashed:${password}`),
};

const fakeTokens: TokenCodec = {
  sign: (claims) => Promise.resolve(JSON.stringify(claims)),
  verify: (token) => {
    try {
      return Promise.resolve(JSON.parse(token) as SessionClaims);
    } catch {
      return Promise.resolve(null);
    }
  },
};

const requirements = () => {
  const users = inMemoryUsers();
  return {
    account: {
      users,
      tokens: fakeTokens,
      passwords: fakePasswords,
      clock: clockOf({ now: () => STAMP_AT, newId: () => 'seeded' }),
    },
    now: () => STAMP_AT,
    maxConcurrentLogins: 8,
  };
};

/**
 * A complete host graph over the same requirements.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 every prior 040.6 module's own
 * `module.test.ts` records for its two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .installModule(authenticationModule)
    .register({
      account: DiBag.fromSyncFactory(() => requirements().account),
      now: DiBag.fromSyncFactory(() => requirements().now),
      maxConcurrentLogins: DiBag.fromSyncFactory(() => requirements().maxConcurrentLogins),
    })
    .build();

/**
 * Compile-negative: the map's own "verifier-without-identity-store is
 * unrepresentable" requirement, watched by the type checker rather than by a
 * runtime assertion. `account.users` is `AuthServiceOptions['users'] &
 * NonNullable<AuthServiceOptions['identities']>` unconditionally — supplying
 * only a `UserStore` (no `resolveOidcIdentity`) alongside an `oidc` verifier
 * cannot satisfy `AuthenticationRequirements['account']`.
 *
 * (No `Proof:` comment here yet — this file is created in slice 1 step 1,
 * before step 7 rehearses row 7's fault. Slice 1 step 7 gives the exact
 * comment text to insert here, once that fault is actually observed.)
 */
function userStoreOnly(): UserStore {
  const users = inMemoryUsers();
  return {
    create: (user, stamp) => users.create(user, stamp),
    findByUsername: (username) => users.findByUsername(username),
    findById: (id) => users.findById(id),
  };
}
const noopVerifier: OidcVerifier = { verify: () => Promise.resolve(null) };
const verifierWithoutStore = (): AuthenticationRequirements['account'] => ({
  // @ts-expect-error `account.users` must also satisfy `OidcIdentityStore` when `oidc` is supplied.
  users: userStoreOnly(),
  oidc: noopVerifier,
  tokens: fakeTokens,
  passwords: fakePasswords,
  clock: clockOf({ now: () => STAMP_AT, newId: () => 'seeded' }),
});

describe('the Authentication module', () => {
  it('registers and signs in a password-only account, with no oidc store dependency', async () => {
    const { auth } = installAuthentication(requirements());

    const registered = await auth.register('a-new-user', 'a-long-enough-password');
    expect(registered).toMatchObject({ ok: true });

    const login = await auth.login('a-new-user', 'a-long-enough-password');
    expect(login).toMatchObject({ ok: true });
  });

  it('authenticates an OIDC identity through the combined users store', async () => {
    const users: UserStore & OidcIdentityStore = inMemoryUsers();
    const oidc: OidcVerifier = {
      verify: () =>
        Promise.resolve({
          issuer: 'https://idp.example',
          subject: 'sub-1',
          email: 'person@example.com',
          emailVerified: true,
          scopes: ['read', 'write'],
        }),
    };
    const { auth } = installAuthentication({
      account: {
        users,
        oidc,
        tokens: fakeTokens,
        passwords: fakePasswords,
        clock: clockOf({ now: () => STAMP_AT, newId: () => 'seeded' }),
      },
      now: () => STAMP_AT,
      maxConcurrentLogins: 8,
    });

    const principal = await auth.authenticate('an-oidc-bearer-token');

    expect(principal).toMatchObject({ scopes: ['read', 'write'] });
  });

  it('throttles a sixth same-account, same-IP reservation over the graph installAuthentication wires', () => {
    const { loginThrottle } = installAuthentication(requirements());

    for (let attempt = 0; attempt < 5; attempt += 1) {
      loginThrottle.recordFailure('a-user', '198.51.100.1');
    }

    expect(loginThrottle.canAttempt('a-user', '198.51.100.1')).toBe(false);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `AuthenticationExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installAuthentication(requirements());

    expect(Object.keys(exposed).sort()).toEqual(['auth', 'loginThrottle']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its authOptions binding out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('authOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "authOptions" is not registered.');
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its throttleOptions binding out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('throttleOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "throttleOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    const labels = host.inspectGraph().bindings.map((binding) => binding.label);

    expect(labels).toContain(`${AUTHENTICATION_LABEL}/authOptions`);
    expect(labels).toContain(`${AUTHENTICATION_LABEL}/throttleOptions`);
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .installModule(authenticationModule)
      .register({
        account: DiBag.fromSyncFactory(() => requirements().account),
        now: DiBag.fromSyncFactory(() => requirements().now),
      }) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('loginThrottle')).toThrow(
      `Cannot resolve "${AUTHENTICATION_LABEL}/throttleOptions": dependency "maxConcurrentLogins" is not registered. Resolution path: loginThrottle -> ${AUTHENTICATION_LABEL}/throttleOptions -> maxConcurrentLogins.`,
    );
  });

  it('cannot build a verifier-without-identity-store account (compile-negative)', () => {
    expect(typeof verifierWithoutStore).toBe('function');
  });
});
```

### 10.2 Import-path edits for `authentication.feature.ts` (slice 1, step 2 — illustrative, not `git apply --check`ed: see section 15)

```diff
 import type { AuthenticatedUser, OidcIdentity } from '@wbs/contracts';

-import type { Clock } from '../ports/clock';
-import type { OidcVerifier } from '../ports/oidc-verifier';
-import type { PasswordHasher, TokenCodec } from '../ports/runtime';
-import type { OidcIdentityStore, User, UserStore } from '../ports/user-store';
+import type { Clock } from '../../ports/clock';
+import type { OidcVerifier } from '../../ports/oidc-verifier';
+import type { PasswordHasher, TokenCodec } from '../../ports/runtime';
+import type { OidcIdentityStore, User, UserStore } from '../../ports/user-store';
```

### 10.3 The two compatibility shims (slice 1, step 2 — full replacement content)

`libs/wbs/application/core/src/service/auth.service.ts`:

```ts
export * from '../module/authentication/authentication.feature';
```

`libs/wbs/application/core/src/service/login-throttle.ts`:

```ts
export * from '../module/authentication/login-throttle';
```

### 10.4 `contract.ts`, `module.ts`, `check.ts` and the slice-1 `README.md` (slice 1, step 3 — full content, no `Proof:` comments)

`contract.ts`:

```ts
import type { AuthService, AuthServiceOptions } from './authentication.feature';
import type { LoginThrottle } from './login-throttle';

/**
 * What a host must supply to install {@link authenticationModule}.
 *
 * `account` narrows {@link AuthServiceOptions} at exactly one field: `users`
 * must satisfy both `UserStore` and `OidcIdentityStore`, matching the map's
 * own Authentication row ("accountful `users: UserStore & OidcIdentityStore`")
 * and `ports/stores.ts`'s own `TransactionalStores.users`. The legacy
 * `AuthServiceOptions.identities?: OidcIdentityStore` field stays optional on
 * the constructor itself (unchanged, still directly constructible), but this
 * module's own `module.ts` never leaves it unset: its private `authOptions`
 * binding always derives `identities` from `account.users`, so a host of this
 * module cannot supply
 * an `oidc` verifier over a store that cannot resolve OIDC identities — the
 * map's own "verifier-without-identity-store is unrepresentable" requirement,
 * enforced at this module's own boundary rather than by widening
 * `AuthServiceOptions` itself, which extraction preserves unchanged.
 *
 * **Preserved K3 debt.** `AuthService` directly calls `users.create`,
 * `findByUsername`, `findById` and `identities.resolveOidcIdentity` — all
 * `ports/user-store.ts` repository ports, not a resource-service contract.
 * This extraction moves the file; it does not close that debt. Tracked under
 * task 7.4 of `openspec/changes/adopt-di-composition/tasks.md`, the same
 * disposition Plan import's own `PlanImportRequirements` records for its own
 * preserved direct-store calls.
 *
 * `now` and `maxConcurrentLogins` build {@link LoginThrottle}'s own options;
 * they stay two flat requirements, not `AuthServiceOptions`'s own `clock`
 * reused, because the throttle was already built from a bare `() => number`
 * callback before this extraction and this packet preserves that shape
 * exactly rather than widening it to depend on the whole `Clock` port.
 */
export interface AuthenticationRequirements {
  readonly account: Omit<AuthServiceOptions, 'identities'> & {
    readonly users: AuthServiceOptions['users'] & NonNullable<AuthServiceOptions['identities']>;
  };
  readonly now: () => number;
  readonly maxConcurrentLogins: number;
}

/** What installing {@link authenticationModule} adds to a host graph. */
export interface AuthenticationExports {
  readonly auth: AuthService;
  readonly loginThrottle: LoginThrottle;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching `module.application.plan-history`'s,
 * `module.application.bounded-replay-sweep`'s, `module.application.realtime`'s
 * and `module.application.plan-import`'s; the wiki module identifier is
 * `module.application.authentication` and the label drops the `module.`
 * prefix.
 */
export const AUTHENTICATION_LABEL = 'application.authentication';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import { AuthService, type AuthServiceOptions } from './authentication.feature';
import { AUTHENTICATION_LABEL, type AuthenticationRequirements } from './contract';
import { LoginThrottle, type LoginThrottleOptions } from './login-throttle';

/**
 * Authentication as a sealed DI Bag module.
 *
 * `auth` and `loginThrottle` are exported as two current compatibility
 * values, the same shape Realtime's own `announcements`/`gatewayBroadcaster`/
 * `replayBuffer` keep: the map's own row names a single future `Authentication`
 * feature contract as the eventual surface, with `auth` retained only as a
 * migration alias, but no accepted change supplies that redesign yet, so this
 * module seals the two existing collaborators rather than inventing one.
 *
 * `throttleOptions` stays private to each installation, so a host cannot name
 * it — resolving it answers `DI_BAG_MISSING_REGISTRATION`, and a requirement
 * the host forgot is reported against `application.authentication/throttleOptions`
 * rather than against an anonymous binding. `authOptions` is also private:
 * it is the one place `account.users` is spread into both `users` and
 * `identities` for the legacy `AuthServiceOptions` shape, so no host of this
 * module can construct `AuthService` with a store that answers only
 * `UserStore`.
 *
 * The module registers no disposer: `AuthService` holds only borrowed ports
 * and `LoginThrottle` holds an in-process bounded map with no timer, socket or
 * handle of its own. Both lifetimes stay the composition root's, exactly as
 * `bootBe01` owns the source it borrows.
 */
export const authenticationModule = DiBag.createBuilder()
  .register({
    authOptions: DiBag.fromSyncFactory(
      ({ account }: { account: AuthenticationRequirements['account'] }): AuthServiceOptions => ({
        ...account,
        identities: account.users,
      }),
    ),
    throttleOptions: DiBag.fromSyncFactory(
      ({
        now,
        maxConcurrentLogins,
      }: {
        now: () => number;
        maxConcurrentLogins: number;
      }): LoginThrottleOptions => ({ now, maxConcurrent: maxConcurrentLogins }),
    ),
  })
  .register({
    auth: DiBag.fromSyncFactory(
      ({ authOptions }: { authOptions: AuthServiceOptions }): AuthService =>
        new AuthService(authOptions),
    ),
    loginThrottle: DiBag.fromSyncFactory(
      ({ throttleOptions }: { throttleOptions: LoginThrottleOptions }): LoginThrottle =>
        new LoginThrottle(throttleOptions),
    ),
  })
  .buildModule(['auth', 'loginThrottle'], { label: AUTHENTICATION_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { AuthenticationExports, AuthenticationRequirements } from './contract';
import { authenticationModule } from './module';

/**
 * Installs {@link authenticationModule} over supplied requirements and
 * returns only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Authentication
 * can reach a private binding or a host key through it. The type checker does
 * not enforce that on its own: an object with an extra property returned
 * through a variable still satisfies {@link AuthenticationExports}, so the
 * module's tests enumerate what this function returns.
 */
export function installAuthentication(
  requirements: AuthenticationRequirements,
): AuthenticationExports {
  const bag = DiBag.createBuilder()
    .installModule(authenticationModule)
    .register({
      account: DiBag.fromSyncFactory(() => requirements.account),
      now: DiBag.fromSyncFactory(() => requirements.now),
      maxConcurrentLogins: DiBag.fromSyncFactory(() => requirements.maxConcurrentLogins),
    })
    .build();
  return { auth: bag.resolve('auth'), loginThrottle: bag.resolve('loginThrottle') };
}
```

`README.md` (slice 1 — no `module-index` block, no "Wiki registration" section):

```md
# Authentication

The fifth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's,
Realtime's and Plan import's pattern: `module.ts` seals the graph, `check.ts` is the only place
that builds a bag, and `contract.ts` states the combined account store and the throttle's two
runtime values a host must supply.

`authentication.feature.ts` (the moved `service/auth.service.ts`) registers and signs in password
and OIDC accounts and resolves a session token to the caller's principal. `login-throttle.ts` (the
moved `service/login-throttle.ts`) is its own admission collaborator: a fixed-window failure limit
and bounded per-process concurrency cap over password verification, exported alongside `auth` as a
second current compatibility value rather than folded into one interface — see `module.ts`'s own
note on why. Private bindings are named under the `application.authentication` label, so a DI
failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`, `libs/wbs/application/core/src/service/auth.service.ts`
and `libs/wbs/application/core/src/service/login-throttle.ts` keep the former `@wbs/core`
deep-import names.
```

### 10.5 Sideways-boundary rows diff (slice 1, step 6 — `git apply --check`ed, see section 15)

```diff
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
index 72b3a90e..d61702a7 100644
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -81,6 +81,20 @@ const configPath = `${coreRoot}tsconfig.lib.json`;
  * '../../service/auth.service'` into the same file failed this suite with only
  * the `service/auth.service.ts` violation and no `http/endpoint.ts` entry
  * (0 pass, 1 fail).
+ *
+ * The tenth through thirteenth rows are the same rule re-scoped to
+ * Authentication's own new real file path: once `auth.service.ts` moved to
+ * `module/authentication/authentication.feature.ts`, the four existing rows
+ * above (targeting the compatibility shim `service/auth.service.ts`) no
+ * longer catch a direct import of the module's own real path, only an import
+ * that still goes through the shim. The fourteenth row is preparation 4's own
+ * half re-scoped to Authentication's own directory (it must not import the
+ * HTTP endpoint for a principal either).
+ *
+ * (No `Proof:` comments here yet — this diff is applied in slice 1 step 6,
+ * before step 7 rehearses rows 8 through 12's faults. Slice 1 step 7 gives
+ * the exact five comments to insert here, in order, once each fault is
+ * actually observed.)
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
@@ -113,6 +127,26 @@ const routes = [
     reaches: 'http/endpoint.ts',
     from: (path: string) => path.startsWith('module/plan-import/'),
   },
+  {
+    reaches: 'module/authentication/authentication.feature.ts',
+    from: (path: string) => path.startsWith('use-cases/'),
+  },
+  {
+    reaches: 'module/authentication/authentication.feature.ts',
+    from: (path: string) => path.startsWith('module/bounded-replay-sweep/'),
+  },
+  {
+    reaches: 'module/authentication/authentication.feature.ts',
+    from: (path: string) => path.startsWith('module/realtime/'),
+  },
+  {
+    reaches: 'module/authentication/authentication.feature.ts',
+    from: (path: string) => path.startsWith('module/plan-import/'),
+  },
+  {
+    reaches: 'http/endpoint.ts',
+    from: (path: string) => path.startsWith('module/authentication/'),
+  },
 ] as const;

 function underSrc(fileName: string): string {
```

### 10.6 `compose.ts`, `compose.test.ts` and `index.ts` diff (slice 2 — `git apply --check`ed, see section 15)

```diff
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
index 085fefaf..d8c27c54 100644
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -140,6 +140,8 @@ test('accountless composition has no auth capability', () => {
   // satisfy this negative by making the whole fixture unknown.
   // @ts-expect-error An accountless composition deliberately has no auth capability.
   expect(graph.auth).toBeUndefined();
+  // @ts-expect-error An accountless composition deliberately has no throttle capability either.
+  expect(graph.loginThrottle).toBeUndefined();

   const accountRuntime = {
     ...runtime,
@@ -184,6 +192,7 @@ test('accountful composition exposes auth when its source and runtime both offer
   });

   expect((await graph.auth.register('account', 'password')).ok).toBe(true);
+  expect(graph.loginThrottle.canAttempt('account', '192.0.2.1')).toBe(true);
 });

 describe('composeServices', () => {
diff --git a/libs/wbs/application/core/src/compose.ts b/libs/wbs/application/core/src/compose.ts
index c746b0b0..449ae165 100644
--- a/libs/wbs/application/core/src/compose.ts
+++ b/libs/wbs/application/core/src/compose.ts
@@ -1,5 +1,8 @@
 import type { AuthenticatedUser, Logger } from '@wbs/contracts';

+import type { AuthService } from './module/authentication/authentication.feature';
+import { installAuthentication } from './module/authentication/check';
+import type { LoginThrottle } from './module/authentication/login-throttle';
 import { installBoundedReplaySweep } from './module/bounded-replay-sweep/check';
 import type { RetentionTimer } from './module/bounded-replay-sweep/retention-timer';
 import { installPlanHistory } from './module/plan-history/check';
@@ -20,11 +23,9 @@ import type { Source } from './ports/source';
 import type { PlanTransactionalStores, TransactionalStores } from './ports/stores';
 import type { Intervals, Timers } from './ports/timers';
 import type { Scope } from './ports/unit-of-work';
-import { AuthService } from './service/auth.service';
 import { CalendarMarkerService } from './service/calendar-marker.service';
 import { CapacityService } from './service/capacity.service';
 import { DirectoryService } from './service/directory.service';
-import { LoginThrottle } from './service/login-throttle';
 import { OptimizerTriggerBroadcaster } from './service/optimizer-trigger-broadcaster';
 import { PriorityBandService } from './service/priority-band.service';
 import { ProjectService } from './service/project.service';
@@ -140,14 +141,23 @@ interface CommonServices extends WritingServices {
   readonly savedPlans: SavedPlanService;
   readonly replay: ReplayOrchestrator;
   readonly retention: RetentionTimer;
-  readonly loginThrottle: LoginThrottle;
   readonly imports: ImportService;
 }

 export type AccountlessServices = CommonServices;

+/**
+ * `auth` and `loginThrottle` both come from the Authentication module and
+ * both stay accountful-only: {@link LoginThrottle} throttles password
+ * verification, which does not exist without an account graph to verify
+ * against. Moving it here (it previously sat on {@link CommonServices},
+ * unconditionally constructed even for the accountless graph) closes the
+ * map's own "Accountless exports neither Authentication nor throttle"
+ * requirement.
+ */
 export interface AccountfulServices extends CommonServices {
   readonly auth: AuthService;
+  readonly loginThrottle: LoginThrottle;
 }

 export type AccountlessSource = Source<PlanTransactionalStores & { readonly users?: never }>;
@@ -254,10 +264,6 @@ export function composeServices(
         shared.logger.error({ err: error }, 'retention sweep failed');
       },
     }).retention,
-    loginThrottle: new LoginThrottle({
-      now: () => runtime.clock.now(),
-      maxConcurrent: shared.maxConcurrentLogins ?? 8,
-    }),
   };

   const hasAccounts = hasAccountStores(source);
@@ -266,11 +272,9 @@ export function composeServices(
     throw new Error('account stores and account runtime must be supplied together');
   }
   if (!hasAccounts || !hasRuntime) return common;
-  return {
-    ...common,
-    auth: new AuthService({
+  const { auth, loginThrottle } = installAuthentication({
+    account: {
       users: source.stores.users,
-      identities: source.stores.users,
       passwords: runtime.passwords,
       tokens: runtime.tokens,
       clock: runtime.clock,
@@ -279,8 +283,11 @@ export function composeServices(
         ? {}
         : { passwordSessions: runtime.passwordSessions }),
       ...(runtime.localIdentity === undefined ? {} : { localIdentity: runtime.localIdentity }),
-    }),
-  };
+    },
+    now: () => runtime.clock.now(),
+    maxConcurrentLogins: shared.maxConcurrentLogins ?? 8,
+  });
+  return { ...common, auth, loginThrottle };
 }

 function hasAccountRuntime(
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
index b265a0cb..f7f6ee46 100644
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -16,6 +16,8 @@
  */
 export * from './compose';
 export * from './http/import.routes';
+export * from './module/authentication/contract';
+export * from './module/authentication/module';
 export * from './module/bounded-replay-sweep/contract';
 export * from './module/bounded-replay-sweep/module';
 export * from './module/plan-history/contract';
```

### 10.7 `kinds.json` diff (slice 2 — `git apply --check`ed, see section 15)

```diff
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
index 5202cf01..72631b8c 100644
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -240,9 +240,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/service/auth.service.ts",
-      "kind": "feature",
-      "capability": "authentication",
-      "rationale": "composeServices and the backend authentication delivery call it to coordinate user and identity stores with verifier, password, token and clock ports for registration and sign-in"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the authentication module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/broadcast.ts",
@@ -322,8 +321,7 @@
     {
       "path": "libs/wbs/application/core/src/service/login-throttle.ts",
       "kind": "support",
-      "disposition": "authentication admission throttle; move to the authentication module",
-      "rationale": "composeServices constructs it and auth-password-endpoints.ts applies its injected-clock failure windows and bounded admission around password verification"
+      "disposition": "re-export shim; delete when importers use @wbs/core or the authentication module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/numbered-work-item.ts",
```

### 10.8 The final README (slice 3, step 5 — full content)

```md
# Authentication

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.authentication","memberships":[{"kind":"path","path":"authentication.feature.ts"},{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"login-throttle.ts"},{"kind":"path","path":"login-throttle.test.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"The commit-then-issue and fail-closed-verifier invariants are documented on AuthService and LoginThrottle; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/auth.service.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/login-throttle.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the two compatibility shims are declared; the be-01 app-layer shims (apps/wbs/be-01/src/service/auth.service.ts, .../login-throttle.ts) and their own downstream consumers deep-import through @wbs/core and are not tracked here."}} -->

The fifth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's,
Realtime's and Plan import's pattern: `module.ts` seals the graph, `check.ts` is the only place
that builds a bag, and `contract.ts` states the combined account store and the throttle's two
runtime values a host must supply.

`authentication.feature.ts` (the moved `service/auth.service.ts`) registers and signs in password
and OIDC accounts and resolves a session token to the caller's principal. `login-throttle.ts` (the
moved `service/login-throttle.ts`) is its own admission collaborator: a fixed-window failure limit
and bounded per-process concurrency cap over password verification, exported alongside `auth` as a
second current compatibility value rather than folded into one interface — see `module.ts`'s own
note on why. Private bindings are named under the `application.authentication` label, so a DI
failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`, `libs/wbs/application/core/src/service/auth.service.ts`
and `libs/wbs/application/core/src/service/login-throttle.ts` keep the former `@wbs/core`
deep-import names.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.authentication` (`docs/wiki-policy/policy.json`'s
`boundary.application.authentication`). The boundary's `sourceSelector` binds this new directory
to `authentication.feature.ts`'s own single pre-namespacing predecessor, the file
`docs/code-organization/kinds.json` classified `capability: authentication` before the move, which
existed at the pilot's frozen `sourceRevision` — the same mechanism `boundary.application.realtime`
uses for its own `replay.ts` predecessor. `login-throttle.ts` is not separately named in the source
selector: the wiki registration's guarantee is one predecessor per module directory, not one per
file it holds, exactly as Realtime's own `gateway-broadcaster.ts`, `replay-buffer.ts` and
`replay-orchestrator.ts` have no separate baseline entry either.
```

### 10.9 Registration diff — `modules.json`, `policy.json`, `pilotPaths` (slice 3, steps 1, 3, 5 — `git apply --check`ed, see section 15)

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
index 5a4f143a..e66c403b 100644
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -35,6 +35,7 @@ const pilotPaths = [
   'docs/wiki-policy/bootstrap-policy.json',
   'docs/wiki-policy/relationships.json',
   'docs/wiki-policy/relationships.bootstrap.json',
+  'libs/wbs/application/core/src/module/authentication/README.md',
   'libs/wbs/application/core/src/module/bounded-replay-sweep/README.md',
   'libs/wbs/application/core/src/module/plan-history/README.md',
   'libs/wbs/application/core/src/module/realtime/README.md',
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
index 01806b72..cfadaa72 100644
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -29,6 +29,28 @@
         ]
       }
     },
+    {
+      "moduleId": "module.application.authentication",
+      "name": "Authentication sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "libs/wbs/application/core/src/module/authentication",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "libs/wbs/application/core/src/module/authentication/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "libs/wbs/application/core/src/compose.ts" },
+          { "kind": "path", "path": "libs/wbs/application/core/src/index.ts" },
+          { "kind": "path", "path": "libs/wbs/application/core/src/service/auth.service.ts" },
+          { "kind": "path", "path": "libs/wbs/application/core/src/service/login-throttle.ts" }
+        ]
+      }
+    },
     {
       "moduleId": "module.application.bounded-replay-sweep",
       "name": "Bounded replay sweep sealed DI Bag module",
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
index 2bb2cf10..9142af16 100644
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -935,6 +935,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.application.authentication",
+      "selector": {
+        "kind": "prefix",
+        "value": "libs/wbs/application/core/src/module/authentication"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "libs/core/src/service/auth.service.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "73c84b20a377349c4fd215cb90a4807ef3370267",
+          "path": "libs/core/src/service/auth.service.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

### 10.10 `tools/tool-devsync` legacy-pin diff (slice 3, step 7 — `git apply --check`ed, see section 15)

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
index 9f3c64b6..3394fcaa 100644
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -621,7 +621,7 @@ test('every legacy source occurrence and relevant text family is pinned', async
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 45,
+      'historical policy selector or baseline': 47,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
     },
@@ -812,8 +812,13 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // `libs/core/src/use-cases/replay.ts` this module was extracted from; raised `historical policy
     // selector or baseline` from 43 to 45 and occurrences from 261 to 263, no unclassified entries
     // (2026-09-23).
-    digest: 'a3db8f9766fa58137d1067c35e0628fd9020100aac871e07c0137a28ac772cd4',
-    occurrences: 263,
+    // Proof: registering `module.application.authentication` added its
+    // `boundary.application.authentication`'s `sourceSelector` and one `baselineEntries` path, both
+    // naming the pre-move `libs/core/src/service/auth.service.ts` this module was extracted from;
+    // raised `historical policy selector or baseline` from 45 to 47 and occurrences from 263 to 265,
+    // no unclassified entries (2026-09-23).
+    digest: '3eca3cf1a2f8d1703b42edfd40be279a5a144034c000a812d7b70eb8b2cfef62',
+    occurrences: 265,
     unclassified: [],
   });
 });
```

### 10.11 `tasks.md` diff (slice 3, step 8 — `git apply --check`ed, see section 15)

```diff
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
index 5e8d4d09..0001d184 100644
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -88,8 +88,24 @@
       returned `ImportService`, the private `importOptions` binding exported, and the label
       dropped. Wiki registration (task 7.5) is **not** landed for this module; see 7.5's own note
       below.
-- [ ] 3.5 Authentication, absorbing the login throttle and covering the password-only and OIDC
-      graphs; the accountless graph exports neither.
+- [x] 3.5 Authentication, absorbing the login throttle and covering the password-only and OIDC
+      graphs; the accountless graph exports neither. Landed 2026-09-23 as
+      `libs/wbs/application/core/src/module/authentication/`, with `service/auth.service.ts` and
+      `service/login-throttle.ts` kept as compatibility re-export shims, and
+      `docs/code-organization/kinds.json`'s two rows for them rewritten in place (95 entries,
+      unchanged). `loginThrottle` moved off `CommonServices` onto `AccountfulServices`, alongside
+      `auth`, so the accountless graph exports neither, watched by a new `@ts-expect-error`
+      negative in `compose.test.ts`. The module's own `AuthenticationRequirements['account']`
+      requires `users: UserStore & OidcIdentityStore` unconditionally — the map's own "verifier
+      without identity store is unrepresentable" requirement — watched by a compile-negative
+      fixture; `identities` is always derived from that combined store, never supplied separately.
+      `auth` and `loginThrottle` remain two current compatibility values rather than one
+      `Authentication` feature contract; the map's own single-contract target and the delivery-side
+      throttle-orchestration move (K2) are not this task's scope. Proof: negatives for the
+      installer leaking its bag, its resolver leaking through the returned `AuthService`, each of
+      the two private bindings (`authOptions`, `throttleOptions`) exported independently, and the
+      label dropped. Wiki registration (task 7.5) IS landed for this module; see 7.5's own note
+      below.
 - [ ] 3.6 Optimization, with its repository ports and event projections.

 ## 4. Plan document and the adapter-side modules
@@ -160,7 +160,18 @@
       bound to the pre-move `libs/core/src/use-cases/replay.ts` alone — the file `kinds.json`
       classified `capability: realtime` before the move. `gateway-broadcaster.ts`,
       `replay-buffer.ts` and `replay-orchestrator.ts` have no separate baseline entry, for the same
-      reason. **Not landed for Plan import (task 3.4).** Every existing pilot boundary under the
+      reason. Landed again 2026-09-23 for Authentication as
+      `libs/wbs/application/core/src/module/authentication/README.md`,
+      `docs/wiki-policy/modules.json`'s `module.application.authentication` row and
+      `docs/wiki-policy/policy.json`'s `boundary.application.authentication`, using a
+      `sourceSelector` bound to the pre-namespacing `libs/core/src/service/auth.service.ts`
+      alone — the file `kinds.json` classified `capability: authentication` before the move.
+      `login-throttle.ts` has no separate baseline entry, for the same reason as Realtime's own
+      satellite files above. This withdraws review round 1's own finding that a multi-file
+      module cannot register (040-6 packet E4, first revision): Realtime's own precedent above
+      already refutes it, and the second rehearsed experiment's own failure was a missing
+      `pilotPaths` overlay entry — packet D's own lesson — not a mechanism limit.
+      **Not landed for Plan import (task 3.4).** Every existing pilot boundary under the
       namespaced tree is registered through a `sourceSelector` bound to a pre-namespacing
       predecessor file that existed at the pilot's frozen `sourceRevision`. Both of Plan import's
       own files existed before namespacing — `libs/core/src/service/import.service.ts` introduced
```

Task 7.5's own running note gains one further paragraph, inserted by the second hunk above between
Realtime's own entry and Plan import's own "Not landed" paragraph (which continue as one running
prose block in the real file, with no blank line between them): recording the registration and
explicitly withdrawing the prior revision's impossibility finding. Section 13 keeps this packet's
own longer-form disposition of that withdrawal; the two are independent texts — section 13 is
not copied verbatim into `tasks.md`.

## 11. Global stop conditions

These are not preconditions — each slice's own step 0 in section 7 holds those, so that a later
slice is never blocked by an earlier slice's own work. Stop on any of the following at any point:

- A red checkpoint reports `0 tests ran`: the `-t` filter did not match. Anchor the joined
  `describe` and title, or use the unanchored title alone; never include Bun's printed `>`.
- A mutation leaves its named test passing. That is first a location mistake: restore, check the
  location against section 10, redo once, and stop if it still passes.
- A command needs the network, or an OpenSpec invocation tries to download.
- A step-0 line in section 7 does not print what it says.
- A section 10 edit anchor (an exact line, diff context or JSON entry) does not match the file as
  found. The file drifted from what this packet assumed; report the mismatch, do not invent a
  repair.
- A pin this packet records before its own edits (`kinds.json`'s entry count, the wiki-policy
  module/boundary counts, the legacy-pin literal) differs from what section 7's own step 0
  observes, **except** the one change this packet's own slice explicitly prescribes to each pin
  (the `kinds.json` disposition rewrite in slice 2 that leaves the count unchanged; the wiki-policy
  counts rising by exactly one module and one boundary in slice 3; the legacy-pin literal moving by
  exactly the amount slice 3's own step 7 states).
- **Explicitly permitted, not a stop:** slice 2 moving `loginThrottle` from `CommonServices` to
  `AccountfulServices` and installing it only in the accountful branch. This is this packet's own
  prescribed accountful/accountless split correction (section 1's own goal), not an out-of-lane
  behavioral change. Any OTHER change to `AuthService`'s or `LoginThrottle`'s own runtime behaviour
  is still a stop.
- Any check this packet names is unavailable. Report the block; never skip it silently.
- A check requires an edit this packet does not itself prescribe (an out-of-lane fix). Report the
  block; never make the edit.

**Not a stop.** An Nx target outliving the tool's own wait is STILL RUNNING, not failed: poll it
under a status-recording wrapper rather than treating the timeout as a failure.

## 12. Ready to commit

Each slice ends in its own planner commit, so there is no single final `git status`. Each slice
records `base=$(git rev-parse HEAD)` in its step 0 and hands over `git diff --name-only "$base"`
plus `git ls-files --others --exclude-standard`, which cannot be broken by the planner's own
commits.

| Slice | `git diff --name-only` adds                                                                                                                                                                                                                                                                                                                                                      | Untracked adds                                                                                                                                                                                                                  | Deleted                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1     | `libs/wbs/application/core/src/service/auth.service.ts`, `.../service/login-throttle.ts` (each replaced by its shim), `.../ports/sideways-type-boundaries.test.ts`, `openspec/changes/adopt-di-composition/verify.md`                                                                                                                                                            | all eight files under `libs/wbs/application/core/src/module/authentication/`: `authentication.feature.ts`, `check.ts`, `contract.ts`, `login-throttle.ts`, `login-throttle.test.ts`, `module.test.ts`, `module.ts`, `README.md` | `libs/wbs/application/core/src/service/login-throttle.test.ts` (relocated, not shimmed) |
| 2     | `libs/wbs/application/core/src/compose.ts`, `.../compose.test.ts`, `.../index.ts`, `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`                                                                                                                                                                                                        | nothing                                                                                                                                                                                                                         | nothing                                                                                 |
| 3     | `libs/wbs/application/core/src/module/authentication/README.md` (its slice-1 content replaced), `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md` | nothing                                                                                                                                                                                                                         | nothing                                                                                 |

## 13. Findings for the map and for packets A-E3's landed code

- **Map, `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`:** no defect
  found. The map's Authentication row matches this packet's own measurement exactly, including the
  "verifier-without-identity-store is unrepresentable" requirement this packet's own review 1
  caught was not yet enforced by a first draft.
- **Packets A, B, C, D, E, E2, E3:** no defect found in landed code.
- **This packet's own first revision contained a false finding, now withdrawn (review 1's own
  Critical 3).** The first revision measured that `apps/wiki/cli/src/policy/pilot-policy.test.ts`'s
  own structural comparison requires `boundary.baselineEntries` to equal exactly what one
  `selector`/`sourceSelector` value matches at the frozen revision, and concluded from that
  correctly-observed mechanism that a module with more than one collaborator file could not be
  registered. That conclusion was wrong: `openspec/changes/adopt-di-composition/tasks.md:150` and
  Realtime's own landed `docs/wiki-policy/policy.json:921` both establish that 7.5's own guarantee
  is one predecessor per module DIRECTORY, not one per file — a `sourceSelector` naming only the
  module's own FEATURE file (the one file `kinds.json` classifies with the module's own capability)
  is sufficient; satellite/support files need no baseline entry of their own. The first revision's
  own two rehearsed "refusals" were real observations of a genuinely different failure mode (the
  registered boundary's own README not yet being in `pilotPaths`' own overlay, and the frozen tree's
  own filter finding nothing when the sourceSelector was deliberately made too broad) — both are
  now understood correctly as ordinary intermediate reds in the parity → discovered-index → green
  sequence (section 6, section 7 slice 3), not as evidence of an unconditional mechanism limit. This
  packet thanks review 1 for catching the error before it reached the map.
- **This packet's own module-index block is not wasted work.** The Burokrat rule model's
  `MOD-LAYOUT` requirement (`apps/wiki/cli/src/rules/kinds.ts`) discovers module directories from
  `*.feature.ts`-suffixed files independently of the wiki pilot. This module satisfies that
  requirement, and is now ALSO a genuine pilot member — both are true simultaneously, and this
  packet's own section 8 and section 7 slice 3 are careful to describe `check-indexes committed` as
  proving only the first (index discovery), never conflating it with the second.

## 14. This packet's own document exemption (precondition record, not a slice)

This packet's "Verified facts" section (§3) and "Findings" section (§13) both cite
`libs/core/src/service/auth.service.ts` and `libs/core/src/service/login-throttle.ts` as
pre-namespacing paths. The same reason packets D, E, E2 and E3's own documents needed an entry in
`docs/findings/current-document-check-exemptions.json` applies here: this document is current
prose citing a pre-namespacing path as evidence. That entry must exist, added alongside this packet
document itself, **before** any slice below dispatches — see the intro's dispatch paragraph. No
slice touches that file:

```json
{
  "path": "docs/superpowers/plans/2026-09-21-batch-6/040-6-e4-authentication.md",
  "reason": "task packet whose verified facts and findings sections cite libs/core/src/service/auth.service.ts and libs/core/src/service/login-throttle.ts to prove both have a predecessor at the pilot's frozen sourceRevision, and record the registration this packet's own slice 3 performs using auth.service.ts's own predecessor alone",
  "excuses": ["legacy-root"]
}
```

## 15. `git apply --check` verification

Every fenced diff in this document (section 10.5, section 10.6, section 10.7, section 10.9, section
10.10, section 10.11 — six blocks; section 10.2's illustrative import-line diff is explicitly not
among them, per that section's own note) was extracted to its own file and checked in slice order,
against a disposable worktree of `7a2f25efc21156c86fa0b02389fb68039bd76e96`, applying each preceding
slice's own diff first:

```
=== slice1 apply --check against 7a2f25ef ===
OK1
=== slice2 apply --check against +slice1 ===
OK2
=== slice3 apply --check against +slice1+slice2 ===
OK3
```

All three applied cleanly on the first attempt after this revision's own fixes. This packet's own
committed rehearsal (see the report handed to the caller for the exact SHAs) reproduces the same
diffs byte-for-byte via `git diff <parent> <child> -- <paths>`, so the fenced blocks above are not a
separate, unverified transcription.

## 16. Deferred: label agreement

Whether this module's own `module-index` block's `moduleId` names the same label
`authenticationModule`'s own `buildModule` call seals its bag under is explicitly **not** checked by
this packet, matching every prior 040.6 module's own deferral (packet D's own "Deferred: label
agreement"). That check is a later task with its own design.

## 17. Disposition of review 1

**Verdict of review 1:** NOT READY. All three Criticals, all six Important findings and the one
Minor finding are addressed below.

- **Critical 1 (§7 slice 1 step 2, §§5/12 — relocation cannot be followed consistently). FIXED.**
  `login-throttle.test.ts` is now relocated by filesystem `mv`, its own old path explicitly deleted
  (section 5, section 7 slice 1 step 2, section 12). The two production files are copied and their
  originals replaced with shims. No `git mv` is prescribed to the executor anywhere; section 7's own
  introduction states the executor performs `mv`/`cp` directly. The module directory's own eight
  files (README included) are all named in section 5 and section 12.
- **Critical 2 (§§10.1/10.4, task 3.5 — accepts the forbidden OIDC graph). FIXED.**
  `AuthenticationRequirements['account']` now requires `users: UserStore & OidcIdentityStore`
  unconditionally (contract.ts, section 10.4); `identities` is always derived from it in
  `module.ts`'s own private `authOptions` binding. A password-only test, an OIDC test and a
  compile-negative fixture (`verifierWithoutStore`) are all in `module.test.ts` (section 10.1),
  rehearsed in section 6 (row 7).
- **Critical 3 (§§3/6/9/10.8-10.9/13 — impossibility contradicts the registration contract).
  FIXED.** The impossibility finding is withdrawn everywhere it appeared (README, task note, §3,
  §6, §9, §13 all rewritten). Authentication IS registered in slice 3, using
  `auth.service.ts`'s own predecessor alone, exactly as Realtime's own packet did. The parity red,
  the discovered-index red, the legacy-pin re-pin and the planner's `check-indexes committed` run
  are all rehearsed (section 6 rows 14-18, section 7 slice 3).
- **Important 4 (K3 debt falsely declared absent). FIXED.** `contract.ts`'s own JSDoc now discloses
  the preserved K3 debt, tracked under task 7.4, matching Plan import's own contract (section 10.4).
- **Important 5 (implementation precedes its test; proof premature; nonexistent row cited).
  FIXED.** Slice 2 now applies the `compose.test.ts` hunk alone first, observes the runtime red and
  the `TS2578` typecheck red on the UNCHANGED `compose.ts`, and only then applies the `compose.ts`
  edit; the `Proof:` comment is added only after that observation (section 7 slice 2, section 6 row
  13). The "row 9" reference and the "return only `auth`" ambiguity are both removed.
- **Important 6 (three new boundary checks share one negative). FIXED.** Four independent faults —
  `use-cases/run-command-batch.ts`, `module/bounded-replay-sweep/retention-timer.ts`,
  `module/realtime/gateway-broadcaster.ts` and `module/plan-import/plan-import.feature.ts` — are
  each rehearsed alone, restored between each (section 6 rows 8-11, section 7 slice 1 step 7).
- **Important 7 (baselines not actually established). FIXED.** Every step 0 in section 7 now opens
  with `base=$(git rev-parse HEAD)`; `C` and `F` are explicitly assigned wherever compared; slice 3
  gains its own four `apps/wiki/cli`/`tools/tool-devsync` baselines (a genuinely new obligation this
  slice's own file plan now names, since it edits those directories directly).
- **Important 8 (stop condition prohibits the intended slice-2 change). FIXED.** Section 11 now
  states the throttle-relocation exception explicitly.
- **Important 9 (`check-indexes` claimed as MOD-LAYOUT proof). FIXED.** Section 7 slice 3's own
  closing note and section 8 both now describe `check-indexes committed` as index-discovery
  validation, explicitly distinct from the separate `MOD-LAYOUT` rule check, which is not invoked.
- **Minor 10 (stale references). FIXED.** The `tasks.md` search now correctly cites task 1.4 at line
  23; task 1.8's own scope is described accurately; the boundary-test line range and `visit`'s own
  line are corrected; the row numbering for the legacy-path/wiki-registration/collateral-failure
  observations is corrected throughout (this revision renumbers section 6 entirely to avoid stale
  cross-references recurring).

Every fenced diff affected by this review was regenerated against a real edit of the corresponding
file in this same private worktree, Prettier-checked, and re-verified with `git apply --check`
directly against `7a2f25efc21156c86fa0b02389fb68039bd76e96` in a disposable worktree — see section 15.
