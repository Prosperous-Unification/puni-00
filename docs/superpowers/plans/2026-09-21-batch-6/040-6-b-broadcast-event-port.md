# 040.6 B `broadcast.ts` becomes a neutral event port

> **Dispatch:** `--batch batch-6` (the launcher's batch-6 default supplies
> `--batch-dir docs/superpowers/plans/2026-09-21-batch-6`). No slice binds a port, so **no slice needs
> `--network`**, and **no slice needs `--seed`**: every later slice reads the numbers it needs from the
> committed `verify.md` of `adopt-di-composition`, never from another attempt's evidence directory.
> Section 8 scopes every command the sandbox cannot run.
>
> **Revised four times on 2026-09-22.** After review 1 the boundary rule stopped matching text; after review 2
> it stopped reading syntax; after round 3 it stopped reading export **names**; after round 4 it asks the
> type checker from three vantage points — module references, types, identifiers — and runs its declaration
> rule as an independent pass. Twelve reviewer bypasses and eight the author tried are watched negatives, and
> section 6 states the contract as proven together with the two forms that are out of scope. Sections 14 to
> 17 dispose of every finding; 14 to 16 are historical where they describe the implementation.
>
> **Rehearsed on `f862a15a`** (main after batch 6's integration, which carries packet A). Every red,
> green, count and fault below was produced in a private worktree of that commit against the listings
> in section 9, one slice at a time, each ending in a real `git commit` that lefthook accepted.

| Field      | Value                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — second packet                                                                                         |
| Size class | M, in six slices                                                                                                                                                                                 |
| Slices     | 1 extract the port, 2 the check and the production importers, 3 the negatives, 4 the tests, 5 classification and close                                                                           |
| Continues  | `openspec/changes/adopt-di-composition` (task 1.2's first half). The change is **not** reopened: no artifact of it is rewritten, `verify.md` is appended to and one note is added under task 1.2 |
| Implements | `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`, required no-sideways preparation 1                                                                                      |
| Planned on | 2026-09-22, every slice rehearsed end to end in a private worktree of `f862a15a`                                                                                                                 |

**You execute one slice and stop.** The end of your instructions names which. Each slice in section 7
opens with its own step 0: what must hold **before** it edits anything, and the baselines it compares
against. Section 8 names the planner's checks.

## 1. Goal and non-goals

**Goal.** Move `ProjectEvent`, `Broadcaster` and `subscriptionFor` out of
`libs/wbs/application/core/src/service/broadcast.ts` into one neutral port,
`libs/wbs/application/core/src/ports/project-event.ts`, so that every resource and feature publishes
through a contract instead of through a file that also carries Plan commands' batch collector; point
every importer in the core at the port; keep every `@wbs/core` and
`@wbs/core/service/broadcast` name working; and leave behind a checked rule — the only new safety
check this packet adds — that no file names those three contracts anywhere but the port. The rule resolves
symbols with the installed TypeScript type checker, because a regular-expression version was bypassed four
ways and a syntax walk two more ways, all with zero compiler diagnostics; each of those six bypasses, and
three more this author tried, is now a watched negative.

**Non-goals.** No DI Bag module: section 4 shows the map classifies this file as event/port support, not
as a service responsibility, so this packet ships **a port plus its existing adapter** and no
`module.ts`, `contract.ts` or `check.ts`. No library version bump: `di-bag` stays 0.4.0,
`application-exception` 0.5.0, `caught-object-report-json` 11.0.1; `bun.lock` and `package.json` are the
planner's. No Realtime module (`tasks.md` 3.2). **The announcement collector does not move**, and section
4 gives the measured reason. No frontend, gateway or MCP edit: neither `apps/wbs/gw-01` nor
`apps/wbs/mcp-01` imports `@wbs/core` at all (measured). No `apps/wbs/be-01` edit: its
`src/service/broadcast.ts` shim re-exports `@wbs/core/service/broadcast`, which keeps every name. No K3
closure: a feature-service importing this port keeps the same preserved debt it has for
`ports/unit-of-work` and `ports/clock` today.

## 2. Read first

| File                                                                               | Why                                                                                                       |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                                        | Rules R1 to R5. R5 and R3 decide most of the review of this work.                                         |
| `LLM_README.md`                                                                    | The index. Read only the entry your slice needs.                                                          |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                              | "Execution contract" and "Standard blocks every packet uses". Slice 5 runs the OpenSpec validation block. |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-a-di-composition-first-module.md` | The first packet of this item: the form, and what its three reviews refused.                              |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`            | The ownership map. Preparation 1 is this packet; section 4 and section 11 correct the map.                |
| `docs/superpowers/specs/2026-09-19-code-organization-design.md`                    | "Import matrix", K2 to K6, and the classification table that calls broadcast support.                     |
| `libs/wbs/application/core/src/service/broadcast.ts`                               | 283 lines. Slice 1 splits it at an exact line.                                                            |

## 3. Verified facts

Every line was read at `f862a15a` on 2026-09-22; every command result was observed in a private
worktree of that commit.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Evidence                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `service/broadcast.ts` is 283 lines and exports five declarations: `ProjectEvent` (`:26`), `subscriptionFor` (`:200`), `Broadcaster` (`:204`), `HeldAnnouncement` (`:218`), `AnnouncementCollector` (`:245`).                                                                                                                                                                                                                                                   | `wc -l`; `grep -c "^export"` is 5                                                                                                            |
| The event contracts occupy lines 7 to 215 as one contiguous block: `ProjectEvent`'s JSDoc opens at `:7`, `Broadcaster` closes at `:215`, and the collector's own comment opens at `:217`.                                                                                                                                                                                                                                                                       | `sed -n '1,220p'` on that file                                                                                                               |
| Thirty-one names of the three contracts are imported from `broadcast` across twenty-five core files: 22 names in 17 production files, 9 names in 8 test files.                                                                                                                                                                                                                                                                                                  | Slice 2's and slice 4's rehearsed reds, section 6 rows 1 and 5                                                                               |
| No file outside `libs/wbs/application/core/src` imports them by a deep path. `libs/wbs/adapters/store-sqlite` takes `ProjectEvent`, `Broadcaster` and `subscriptionFor` from the `@wbs/core` barrel; `apps/wbs/be-01` takes them from its own `src/service/broadcast.ts` shim, which is `export * from '@wbs/core/service/broadcast';`.                                                                                                                         | `git grep -n "Broadcaster\|ProjectEvent\|subscriptionFor" libs apps`; `apps/wbs/be-01/src/service/broadcast.ts:1`                            |
| `apps/wbs/gw-01` and `apps/wbs/mcp-01` import nothing from `@wbs/core`.                                                                                                                                                                                                                                                                                                                                                                                         | `grep -rn "@wbs/core" apps/wbs/gw-01/src apps/wbs/mcp-01/src` printed nothing                                                                |
| `subscriptionFor`'s JSDoc says gw-01 "matches sockets against it". It does not: gw-01 takes the prefix apart with its own `PROJECT_SUBSCRIPTION` regular expression and links no core code.                                                                                                                                                                                                                                                                     | `libs/wbs/application/core/src/service/broadcast.ts:196-198` against `apps/wbs/gw-01/src/controller/ws.controller.ts:68`                     |
| `service-boundaries.test.ts` asserts `service/broadcast.ts` **exists** and lints it, so the file must stay whatever else moves.                                                                                                                                                                                                                                                                                                                                 | `libs/wbs/application/core/src/service/service-boundaries.test.ts:11`, `:54-59`                                                              |
| `docs/code-organization/kinds.json` holds **95** entries, and its scan roots are `libs/wbs/application/core/src/service`, `…/src/use-cases` and `apps/wbs/be-01/src/service` only. A new file under `ports/` therefore owes no entry, and no `ports/` file has one today.                                                                                                                                                                                       | `tools/tool-devsync/src/service-kinds.ts:15-19`; `python3 -c` over the policy printed `[]` for `/ports/`                                     |
| Feature-services already import repository ports directly: `plan-commands.ts:9` takes `UnitOfWork`, `import.service.ts:3-6` takes `Clock`, `Scheduler`, `SubtreeCopy` and `UnitOfWork`. A port home for the event contracts adds no new class of K3 debt.                                                                                                                                                                                                       | those lines                                                                                                                                  |
| `import.service.ts:147` builds an `AnnouncementCollector`. Plan import is a feature and Plan commands is a feature, so moving the collector into Plan commands would create the same-kind edge K6 forbids.                                                                                                                                                                                                                                                      | `libs/wbs/application/core/src/service/import.service.ts:7`, `:147`; map "Proposed core modules"                                             |
| `lint:source` exists **only** on the Burokrat project. For `wbs-core` the source-lint target is `lint`.                                                                                                                                                                                                                                                                                                                                                         | `bunx nx show project wbs-core --json`: targets are `build:portable`, `lint`, `lint:fast`, `test`, `test:portable`, `test:unit`, `typecheck` |
| The whole-target values on the rehearsed tree, all exit 0: `wbs-core:test` 543 pass over 54 files, `wbs-be-01:test:unit` 519 pass over 49 files, `wbs-be-01:test` 1091 pass over 92 files, `wbs-gw-01:test` 128 pass over 17 files, `wbs-mcp-01:test` 165 pass over 15 files, `tool-devsync:test` 366 pass, `wbs-core:build:portable`, `wbs-core:test:portable`, `wbs-be-01:typecheck`, `wbs-gw-01:typecheck`, `wbs-mcp-01:typecheck`, `nx format:check --all`. | Observed 2026-09-22                                                                                                                          |
| Strict OpenSpec validation is `{"items": 113, "passed": 113, "failed": 0}` before and after this packet: it opens no change.                                                                                                                                                                                                                                                                                                                                    | The README's `jq -s -e` block, observed exit 0                                                                                               |
| TypeScript **6.0.2** is installed as `npm:@typescript/typescript6@6.0.2`, and a test in this repository already imports it, so the boundary rule can parse instead of matching text.                                                                                                                                                                                                                                                                            | `package.json:117`; `apps/wbs/fe-01/src/deadline-copy.test.ts:4`                                                                             |
| `grep` is **ugrep** on the rehearsal host and **GNU grep 3.11** on the reviewer's; ugrep exits **1** for a missing input file as well as for zero matches, printing only a warning, so every step-0 count here is preceded by `test -f` whichever is installed.                                                                                                                                                                                                 | Observed: `grep -c '^ *// Proof:' <missing path>` exited 1                                                                                   |

## 4. Why a port, not a module, and why the collector stays

**The map does not classify this file as a service responsibility.** Its "Proposed core modules" table
has no row for broadcast; the portable-core ledger lists it under
"**Event/feature/root support (4):** split `broadcast.ts`: neutral event/port contracts plus Plan
commands' private collector" (`040-6-backend-module-map.md:225-228`), and required preparation 1 says to
"Move `ProjectEvent`, `Broadcaster`, and `subscriptionFor` to a neutral application event/port location"
so that "Every resource/feature publishes through that port without importing Realtime" (`:80-86`). The
Realtime row is explicit that the owner of the union is not a module: Realtime "implements/consumes the
neutral event port; it does not own the event union or Plan commands' collector" (`:46`). The accepted
design agrees twice: its own backend classification puts "Broadcast and its broadcasters" under
"Neither: support", whose dispositions are domain code, **a repository in disguise**, or a private member
of one module; and a repository is "a pair: a port owned by the framework-free core and an adapter that
satisfies it, exactly as ADR 0014 defines". So this packet ships **the port plus its existing adapter**:
`ports/project-event.ts` is the port, `service/gateway-broadcaster.ts` is the adapter that implements it
today, and `service/optimizer-trigger-broadcaster.ts` is the composition-private decorator. No
`module.ts` is written, and nothing about packet A's sealed-module pattern is copied here — the first
core module that owns this port's implementation is Realtime, `tasks.md` 3.2.

**Why `ports/` and not a new directory.** The core already keeps every contract of this kind in
`src/ports`, and the import matrix lets a resource-service import a repository port. A feature-service
importing one is K3 debt — and three feature-services already do it for `UnitOfWork`, `Clock` and
`Scheduler` (section 3), so this location adds no new class of debt and the port's JSDoc records the
one it inherits. The alternative, a third contract directory, would have to justify itself against K6's
own answer, "sideways work goes through a published event", which is what this port is.

**Why the collector does not move.** Preparation 1 also asks for `AnnouncementCollector` and
`HeldAnnouncement` to move "into Plan commands as batch-private support". Measured: Plan commands has no
module directory yet (`tasks.md` 5.2 is the last module in the change's own order), and
`import.service.ts:147` — Plan import, a different feature — builds a collector too. Making the collector
private to Plan commands today either creates a feature-to-feature import K6 forbids or forces Plan
import's per-scope factory to change in the same breath. Both belong to the packet that seals Plan
commands. This packet therefore leaves the collector in `service/broadcast.ts`, which
`service-boundaries.test.ts:11` requires to exist anyway, re-points its classification at that fact, and
leaves task 1.2 **unticked** with one note under it naming what landed and where the remainder lives.

**Size.** Five slices of one 20-to-40-minute attempt each: the split is mechanical but wide, so the
work is cut by importer group rather than by file, and the one new check is introduced in the slice whose
red it produces.

## 5. File plan

| Path                                                                | Slice   | Create or modify                                                                                                                                                            |
| ------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/application/core/src/ports/project-event.ts`              | 1       | create, from section 9.1                                                                                                                                                    |
| `libs/wbs/application/core/src/service/broadcast.ts`                | 1       | modify: keep the collector, re-export the port (section 9.2)                                                                                                                |
| `libs/wbs/application/core/src/index.ts`                            | 1       | modify, two insertions (section 9.3)                                                                                                                                        |
| `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts` | 2, 3, 4 | create in slice 2 (section 9.4); slice 3 writes two of its eight `// Proof:` comments and slice 4 the other six; slice 5 widens its filter line and corrects one JSDoc line |
| The 17 production importers of section 9.5                          | 2       | modify, one import line each                                                                                                                                                |
| The 8 test importers of section 9.6                                 | 4       | modify, one import line each                                                                                                                                                |
| `docs/code-organization/kinds.json`                                 | 5       | modify, one entry rewritten in place (section 9.7)                                                                                                                          |
| `openspec/changes/adopt-di-composition/tasks.md`                    | 5       | modify, one note under task 1.2 (section 9.8). No box is ticked.                                                                                                            |
| `openspec/changes/adopt-di-composition/verify.md`                   | 1–5     | modify: each slice appends its own baselines, deltas and evidence basenames                                                                                                 |

**Neighbours.** No other batch-6 packet owns any of these paths. `docs/code-organization/kinds.json` is
also the subject of `tasks.md` 1.8, which stays unticked and untouched here. Section 10's cumulative
check is a `git diff --name-only` against a base each slice records itself, so the planner's own commits
— a revision of this packet file included — cannot break it.

## 6. Rehearsed observations

Every row was produced in a private worktree of `f862a15a` against the final listing in section 9.4, and
the literal fragment is what Bun 1.4.2 printed. Restore a mutated file from a copy under `"$TMPDIR"` and
prove it with `cmp` **before** asserting on any captured status.

**The contract, exactly as proven.** A reference whose **checker-resolved symbol or type** is one of the
port's exported symbols is reported unless it came from the port itself; so is any reference to a module
that hands out one of them, with `export *` graphs followed recursively. That is the same resolution
TypeScript uses to type-check the program, so a rename, a `default`, a namespace, a barrel, an awaited
dynamic import, an element access, an `import` type or an indexed `typeof import(…)` are all one question.
**What is not covered, by design:** a _new symbol_ that merely mirrors a contract — `export type Publisher =
Broadcaster;` or a structurally identical interface under another name — is not a reference to the port, so
rule 1 does not see it, and rule 2 sees it only if it takes one of the port's names. Four reviews found
routes; the residual above is stated as a limit, not defended as a claim.

| #   | Where                                                                                            | Fault injected                                                                                                                  | Test that observed it                                        | Literal fragment observed                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 2 red, on the tree slice 1 leaves                                                          | none; the rule is new                                                                                                           | `is where every reference to the event contracts comes from` | `- []` then 22 rows of `<file>: <name> via service/broadcast.ts`, `+ Received + 24`; `1 pass`, `1 fail`                                                                                                                |
| 2   | slice 5 red, after the filter widens to test files                                               | none; the rule's scope is what changed                                                                                          | the same test                                                | 9 rows of `<test file>: <name> via service/broadcast.ts`, `+ Received + 11`; `1 pass`, `1 fail`                                                                                                                        |
| 3   | `service/step.service.ts`                                                                        | the port import replaced by a named import from `'./broadcast'`                                                                 | the same test                                                | `+ "service/step.service.ts: Broadcaster via service/broadcast.ts",`                                                                                                                                                   |
| 4   | `service/step.service.ts`                                                                        | `import type * as events from './broadcast';` with `broadcast: events.Broadcaster;`                                             | the same test                                                | three rows: the `via` row, `+ "…: './broadcast' hands out the contracts from service/broadcast.ts",` and `+ "…: events hands out the contracts from service/broadcast.ts",`                                            |
| 5   | `service/gateway-broadcaster.ts`                                                                 | a value namespace of `'./broadcast'` read by element access through a local alias (section 9.9)                                 | the same test                                                | `+ "service/gateway-broadcaster.ts: events hands out the contracts from service/broadcast.ts",` and the specifier row                                                                                                  |
| 6   | `service/capacity.service.ts`                                                                    | `import type { Broadcaster } from '../index';`, the barrel route                                                                | the same test                                                | `+ "service/capacity.service.ts: Broadcaster via index.ts",`                                                                                                                                                           |
| 7   | `service/capacity.service.ts`                                                                    | the field written as an `import` type of `'./broadcast'` qualified by `Broadcaster`                                             | the same test                                                | `+ "service/capacity.service.ts: Broadcaster via service/broadcast.ts",` and the specifier row                                                                                                                         |
| 8   | `service/optimizer-trigger-broadcaster.ts` and `service/gateway-broadcaster.ts`                  | `export { subscriptionFor as routeFor } from '../ports/project-event';`, consumed through a namespace of that file              | the same test                                                | `+ "service/gateway-broadcaster.ts: routeFor via service/optimizer-trigger-broadcaster.ts",` plus `routes hands out …`, `routes.routeFor reads a contract out of …`, and an `index.ts` specifier row                   |
| 9   | the same two files                                                                               | `export { subscriptionFor as default } from '../ports/project-event';`, consumed as a default import                            | the same test                                                | `+ "service/gateway-broadcaster.ts: pushTo via service/optimizer-trigger-broadcaster.ts",` and the `index.ts` specifier row                                                                                            |
| 10  | the same two files                                                                               | `export * as events from '../ports/project-event';`, consumed as `routes.events.subscriptionFor`                                | the same test                                                | `+ "service/gateway-broadcaster.ts: routes hands out the contracts from service/optimizer-trigger-broadcaster.ts",`                                                                                                    |
| 11  | `service/optimizer-trigger-broadcaster.ts` and `service/capacity.service.ts`                     | that namespace export consumed as an `import` type qualified `events.Broadcaster`                                               | the same test                                                | `+ "service/capacity.service.ts: Broadcaster via service/optimizer-trigger-broadcaster.ts",`                                                                                                                           |
| 12  | `service/gateway-broadcaster.ts`                                                                 | `const pushTo = (await import('./broadcast'))` indexed by the string `subscriptionFor` — round 4's first route                  | the same test                                                | `+ "service/gateway-broadcaster.ts: './broadcast' hands out the contracts from service/broadcast.ts",` **and** `+ "…: (await import('./broadcast'))['subscriptionFor'] reads a contract out of service/broadcast.ts",` |
| 13  | `service/gateway-broadcaster.ts`                                                                 | `const pushTo: typeof import('./broadcast')['subscriptionFor'] = subscriptionFor;` — round 4's second route                     | the same test                                                | the specifier row **and** `+ "…: typeof import('./broadcast')['subscriptionFor'] reads a contract out of service/broadcast.ts",`                                                                                       |
| 14  | `service/gateway-broadcaster.ts`                                                                 | an awaited dynamic import consumed as a property, `loaded.subscriptionFor(projectId)`                                           | the same test                                                | the specifier row and `+ "…: subscriptionFor via service/broadcast.ts",`                                                                                                                                               |
| 15  | `service/optimizer-trigger-broadcaster.ts` and `service/capacity.service.ts`                     | a two-hop chain: `export type { Broadcaster as Hop } from './broadcast';` re-exported and then imported                         | the same test                                                | four rows naming **both** hops, `service/optimizer-trigger-broadcaster.ts` and `service/broadcast.ts`                                                                                                                  |
| 16  | `service/step.service.ts`                                                                        | the import deleted and a local `interface Broadcaster` declared instead (section 9.9)                                           | `holds the only declaration of each event contract`          | `+ "service/step.service.ts: Broadcaster",`                                                                                                                                                                            |
| 17  | `service/step.service.ts`                                                                        | `Broadcaster` imported as `Publisher` and a `namespace Broadcaster { export const version = 1; }` added — round 4's rule-2 hole | the same test                                                | `+ "service/step.service.ts: Broadcaster",`                                                                                                                                                                            |
| 18  | `service/gateway-broadcaster.ts`                                                                 | `subscriptionFor` declared locally, first as a `const`, then through a binding pattern (section 9.9)                            | the same test                                                | `+ "service/gateway-broadcaster.ts: subscriptionFor",` for **both** forms                                                                                                                                              |
| 19  | `service/working-plan.test.ts`                                                                   | the port import replaced by a named import from `'./broadcast'`                                                                 | `is where every reference to the event contracts comes from` | `+ "service/working-plan.test.ts: Broadcaster via service/broadcast.ts",`. This is what widening the scan in slice 5 buys                                                                                              |
| 20  | `ports/event-port-boundaries.test.ts`, the `permitted` clause in `wholeModuleReference`'s caller | the one-line `const permitted = path === barrelHome && from === collectorHome;` clause and its use deleted                      | the same test                                                | `+ "index.ts: './service/broadcast' hands out the contracts from service/broadcast.ts",`                                                                                                                               |
| 21  | `ports/event-port-boundaries.test.ts`, `coreSource`                                              | ``const coreSource = `${coreRoot}src/runtime/`;``                                                                               | both assertions                                              | `error: the program holds no ports/project-event.ts`; `0 pass`, `2 fail`                                                                                                                                               |
| 22  | `ports/event-port-boundaries.test.ts`, `configPath`                                              | ``const configPath = `${coreRoot}tsconfig.absent.json`;``                                                                       | both assertions                                              | `error: Cannot read file '<core>/tsconfig.absent.json'.`; `0 pass`, `2 fail`                                                                                                                                           |
| 23  | `libs/wbs/application/core/tsconfig.lib.json`                                                    | `"module": "invalid"` added beside `"declaration": true`                                                                        | both assertions                                              | `error: refused tsconfig.lib.json: 6046`; `0 pass`, `2 fail`. With the `parsed.errors` throw **deleted** and the same option, both assertions **passed**: `2 pass`, `0 fail`                                           |
| 24  | `libs/wbs/application/core/src/ports/project-event.ts`                                           | its whole contents replaced by two statements and no export                                                                     | both assertions                                              | `error: ports/project-event.ts is not a module`; `0 pass`, `2 fail`. `wbs-core:typecheck` fails on this one too, and that is recorded rather than claimed otherwise                                                    |
| 25  | `ports/event-port-boundaries.test.ts`, `scannedSources`                                          | `'ports/missing.ts'` added to what it returns                                                                                   | both assertions                                              | `error: the program holds no ports/missing.ts`; `0 pass`, `2 fail`                                                                                                                                                     |

Faults 3 to 15 and 19 fail only the reference assertion; 16, 17 and 18 only the declaration assertion; 20
only the reference assertion; 21 to 25 fail both, each with its own distinct message, because they stop the
program from being built or read correctly. **`wbs-core:typecheck` exits 0 on faults 3 to 19** — the
compiler sees none of them — and fault 24 is the one exception, noted in its row. Fault 23's second half is
what proves the configuration guard is load-bearing.

**What was tried against the rule and what it did.** A further ten minutes of attack, each attempt applied
to a real production file and then restored:

| Attempt                                                                                   | Outcome                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import type { Broadcaster } from '@wbs/core/service/broadcast';` — the deep package path | caught: `service/capacity.service.ts: Broadcaster via service/broadcast.ts`; typecheck exit 0                                                                                             |
| a generic helper: `pick(await import('./broadcast'), 'subscriptionFor')`                  | caught at the import call: `'./broadcast' hands out the contracts from service/broadcast.ts`. That helper does not compile as written (typecheck exit 1); the rule reported it regardless |
| `import type * as events from './broadcast';` in a second publisher                       | caught three ways: the specifier row, the namespace row and the `via` row; typecheck exit 0                                                                                               |
| `import events = require('./broadcast');` with `events.Broadcaster`                       | caught (round 3's attempt, re-verified). That form does not compile under these options                                                                                                   |
| `export type Publisher = Broadcaster;` in a publisher, consumed as `Publisher`            | **not caught, out of scope:** a new type alias is a new symbol, so the consumer references no port symbol                                                                                 |
| a structural copy under another name (`interface Publisher { publish…; latestSeq… }`)     | **not caught, out of scope**, for the same reason                                                                                                                                         |

Why the module-reference half is a closed question rather than an enumeration: a file can obtain a port
symbol only by naming the port module, by naming another module that hands the symbol out, or by receiving
it from a file that did one of those — and every file in the core is scanned, so the induction closes over
the scanned set. The residual is the two out-of-scope forms above, which introduce new symbols instead of
reaching the port's.

**Also observed, and prescribed because of it.**

- The check builds one `ts.Program` per assertion and asks the checker for types, so the whole file runs in
  about **2 seconds** and the whole core suite in about **13** (observed); both `it` blocks carry an
  explicit `120_000` timeout rather than relying on Bun's five-second default.
- `wbs-core:lint` refuses a `here !== undefined` loop over `ts.Node.parent` and a `??` on an indexed lookup
  with `Unnecessary conditional … @typescript-eslint/no-unnecessary-condition` (observed); section 9.4's
  `moduleOfBinding` loop and its route message are written the way they are for that reason.
- **The proof-comment count is read with Bun, not `grep`.** `grep` is ugrep on the rehearsal host and GNU
  grep 3.11 on the reviewers', and a status of 1 can mean "no match" or "could not read the input"; a
  `test -f` gate cannot see an unreadable file either. Rehearsed four ways with the block slice 3 prescribes:
  `proof-comments=8` on the finished check, `proof-comments=0` on a file with none, exit **1** with
  `ENOENT: no such file or directory, open '…/ports/missing.ts'` on a missing path, and exit **1** with
  `EACCES: permission denied, open '…/service/clean-name.ts'` on a file whose mode was temporarily 000.
- Writing each new import where the old one stood leaves `simple-import-sort` unsatisfied;
  `GSETTINGS_BACKEND=memory bunx eslint --fix <files>` moved all twenty-five lines into the positions
  sections 9.5 and 9.6 name, and then exited 0 with nothing further to fix.
- `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` reads a bracketed string followed immediately by
  a parenthesised argument in a routed Markdown document as a link: quoting an element-access call inline
  failed `every routed current document resolves its local links and anchors` with `364 pass`, `2 fail`
  (observed), so section 9.9 names that access through a local alias.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses as `cmd > log 2>&1; echo "exit=$?"`; never read a status through
`tee` and never `|| true`. From the repository root a test path starts with `./`, because a bare path is
a filter that also collects the compiled copies a typecheck leaves under `dist/out-tsc`; whole-project
counts use `(cd libs/wbs/application/core && bun test src)`. Record every baseline **after** the slice
has run its own type check at least once, so `dist/out-tsc` exists either way. Scratch only under
`"$TMPDIR"`, patches and failing output under `"$TMPDIR/evidence"`, and evidence references in
`verify.md` are basenames relative to that directory. The executor cannot change Git state: restore a
mutated file with `cp` from a copy under `"$TMPDIR"` and prove it with `cmp`; the planner commits. Every
slice records `base=$(git rev-parse HEAD)` in its step 0, for section 10.

### Slice 1 — The event contracts become a port

**Step 0.** Every line must print what it says; if one does not, stop.

```sh
base=$(git rev-parse HEAD)
collector=libs/wbs/application/core/src/service/broadcast.ts
test -f "$collector" || { echo "no such file: $collector" >&2; exit 65; }
test ! -f libs/wbs/application/core/src/ports/project-event.ts && echo "gate: nothing to overwrite"
wc -l < "$collector"
grep -c "^export" "$collector"
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
```

Expect the gate line, **283**, **5**, then exit 0. Then record this slice's own whole-core baseline:

```sh
(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/core-baseline.log" 2>&1
echo "exit=$?"
tail -4 "$TMPDIR/evidence/core-baseline.log"
```

Call that pass count `C` and that file count `F`. Observed: `541 pass`, `0 fail`, 53 files. **This slice
must end at `C` and `F` unchanged**, never at an absolute number: it moves declarations and adds no test.

1. Create `libs/wbs/application/core/src/ports/project-event.ts` as section 9.1 prescribes: the four
   import lines, then lines 7 to 215 of `service/broadcast.ts` **byte for byte**, then the two JSDoc
   edits that section names and nothing else.
2. Replace the first 215 lines of `service/broadcast.ts` with the six lines of section 9.2, leaving
   `HeldAnnouncement` and `AnnouncementCollector` untouched. The file must still exist:
   `service-boundaries.test.ts:11` lists it.
3. Apply section 9.3 to `index.ts`.
4. `GSETTINGS_BACKEND=memory bunx prettier --check` the three paths → exit 0 and
   `All matched files use Prettier code style!` (observed).
5. `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache` → exit 0 (observed).
   This slice moves exported declarations, so the type check runs here.
6. `(cd libs/wbs/application/core && bun test src)` → exit 0 with `C` passes over `F` files (observed
   `541 pass`, `0 fail`, 53 files).
7. `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache` → exit 0 (observed). The
   browser bundle is what proves the port is framework-free.
8. Append to `verify.md`: `C`, `F`, the unchanged closing counts, and the evidence basenames. Then
   `GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-di-composition/verify.md` and
   `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0. The append comes first, then its
   format, then the check; every later slice does the same.

Planner commit: `refactor(core): extract the neutral project-event port from broadcast.ts`.

### Slice 2 — The rule, then the production importers

**Step 0.**

```sh
base=$(git rev-parse HEAD)
port=libs/wbs/application/core/src/ports/project-event.ts
collector=libs/wbs/application/core/src/service/broadcast.ts
for each in "$port" "$collector"; do
  test -f "$each" || { echo "no such file: $each" >&2; exit 65; }
done
grep -c "^export function subscriptionFor" "$port"
grep -c "ports/project-event" "$collector"
test ! -f libs/wbs/application/core/src/ports/event-port-boundaries.test.ts && echo "gate: no check yet"
NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache
```

Expect **1**, **3**, the gate line, then exit 0 (all four behaved as written after slice 1 on the
rehearsed tree). Record this slice's own `C` and `F` the way slice 1 does; observed `541` over 53. The
end of this slice requires `C + 2` over `F + 1`.

1. Create `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts` from section 9.4 and run
   `bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts`. Expect the red of
   section 6 fault 1: exit 1, the 22 rows, `1 pass`, `1 fail`. A run reporting `0 tests ran` or a green run
   is a stop. This red is evidence, not a commit: the commit hook lints test files under
   `strictTypeChecked`, so the check and the edits that make it pass land in one slice.
2. Apply section 9.5's seventeen one-line edits.
3. `GSETTINGS_BACKEND=memory bunx eslint --fix` on those seventeen paths → exit 0. It moves any import
   written in the old position into the sorted one (observed; afterwards it had nothing left to fix).
4. `bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts` → exit 0, `2 pass`,
   `0 fail`, `2 expect() calls` (observed).
5. `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache` → exit 0 (observed).
6. `(cd libs/wbs/application/core && bun test src)` → exit 0 with `C + 2` over `F + 1` (observed
   `543 pass`, `0 fail`, 54 files).
7. Append the baselines, the red's 22 rows and the green counts to `verify.md`, then format that file and
   run `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `refactor(core): point every core publisher at the project-event port`.

### Slice 3 — Watch the route rule fail

**Step 0.** The count is read by Bun rather than by `grep`, because a `grep` status of 1 means either "no
match" or "could not read the input", and a `test -f` gate cannot see an unreadable file; Bun throws on
both. Rehearsed four ways in section 6.

```sh
base=$(git rev-parse HEAD)
check=libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
count=$(bun -e 'const lines = (await Bun.file(Bun.argv[1]).text()).split("\n"); console.log(lines.filter((line) => /^\s*\/\/ Proof:/.test(line)).length);' "$check")
echo "proof-comments=$count"
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
```

Expect `proof-comments=0` and exit 0, then exit 0, then `2 pass`, `0 fail` (observed). Record this slice's
`C` and `F` the way slice 2 does — observed `543` over 54 — and require them unchanged at the end.

Inject section 6's faults 3 to 15 and 20 **one at a time**, each saved as a patch under
`"$TMPDIR/evidence"` with the README's `if diff …; then …; else test $? -eq 1; fi` form, each restored with
`cp` and proved with `cmp` before the next and before asserting on any captured status. Section 9.9 gives
every listing a fault inserts, and `NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache` runs
with each of faults 3 to 15 in place and must exit **0**: a fault the compiler already catches would prove
nothing about the rule.

| Fault | Exact location and edit                                                                                                                                                                                                                             | Expected result                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 3     | `service/step.service.ts`: delete its one `'../ports/project-event'` import, add `import type { Broadcaster } from './broadcast';` directly below the `'./assumed-assignee'` import                                                                 | exit 1, `+ "service/step.service.ts: Broadcaster via service/broadcast.ts",`, `1 pass`, `1 fail`                                                |
| 4     | `service/step.service.ts`: that import line becomes `import type * as events from './broadcast';` and `StepServiceOptions`' single `broadcast: Broadcaster;` becomes `broadcast: events.Broadcaster;`                                               | exit 1, section 6 fault 4's three rows, `1 pass`, `1 fail`                                                                                      |
| 5     | `service/gateway-broadcaster.ts`: its one import becomes section 9.9's four lines, and **both** `subscriptionFor(projectId)` calls become `pushTo(projectId)`                                                                                       | exit 1, the `events hands out the contracts from service/broadcast.ts` row and the specifier row, `1 pass`, `1 fail`                            |
| 6     | `service/capacity.service.ts`: its one port import becomes `import type { Broadcaster } from '../index';`                                                                                                                                           | exit 1, `+ "service/capacity.service.ts: Broadcaster via index.ts",`, `1 pass`, `1 fail`                                                        |
| 7     | `service/capacity.service.ts`: delete that import and write its single `broadcast: Broadcaster;` field as section 9.9's `import` type                                                                                                               | exit 1, `+ "service/capacity.service.ts: Broadcaster via service/broadcast.ts",` and the specifier row, `1 pass`, `1 fail`                      |
| 8     | `service/optimizer-trigger-broadcaster.ts`: add section 9.9's `routeFor` re-export below its first import. `service/gateway-broadcaster.ts`: its one import becomes section 9.9's namespace pair and both calls become `routes.routeFor(projectId)` | exit 1, section 6 fault 8's four rows, `1 pass`, `1 fail`                                                                                       |
| 9     | the same, with section 9.9's `default` re-export and `import pushTo from './optimizer-trigger-broadcaster';`, both calls becoming `pushTo(projectId)`                                                                                               | exit 1, `+ "service/gateway-broadcaster.ts: pushTo via service/optimizer-trigger-broadcaster.ts",` and the `index.ts` row, `1 pass`, `1 fail`   |
| 10    | the same, with section 9.9's `export * as events` line and both calls becoming `routes.events.subscriptionFor(projectId)`                                                                                                                           | exit 1, `+ "service/gateway-broadcaster.ts: routes hands out the contracts from service/optimizer-trigger-broadcaster.ts",`, `1 pass`, `1 fail` |
| 11    | that same namespace export, and `service/capacity.service.ts`' field written as section 9.9's qualified `import` type                                                                                                                               | exit 1, `+ "service/capacity.service.ts: Broadcaster via service/optimizer-trigger-broadcaster.ts",`, `1 pass`, `1 fail`                        |
| 12    | `service/gateway-broadcaster.ts`: section 9.9's awaited element access, with both calls becoming `pushTo(projectId)` and the `latestSeq` call taking the subscription name inline                                                                   | exit 1, section 6 fault 12's two rows, `1 pass`, `1 fail`                                                                                       |
| 13    | `service/gateway-broadcaster.ts`: section 9.9's `typeof import(…)` indexed annotation, keeping the port import and renaming both calls to `pushTo(projectId)`                                                                                       | exit 1, section 6 fault 13's two rows, `1 pass`, `1 fail`                                                                                       |
| 14    | `service/gateway-broadcaster.ts`: section 9.9's awaited dynamic import consumed as a property                                                                                                                                                       | exit 1, the specifier row and `+ "service/gateway-broadcaster.ts: subscriptionFor via service/broadcast.ts",`, `1 pass`, `1 fail`               |
| 15    | `service/optimizer-trigger-broadcaster.ts` and `service/capacity.service.ts`: section 9.9's two-hop chain                                                                                                                                           | exit 1, four rows naming both hops, `1 pass`, `1 fail`                                                                                          |
| 20    | `ports/event-port-boundaries.test.ts`: delete the single line `const permitted = path === barrelHome && from === collectorHome;` and the `!permitted &&` conjunct that uses it — no neighbouring line changes                                       | exit 1, `+ "index.ts: './service/broadcast' hands out the contracts from service/broadcast.ts",`, `1 pass`, `1 fail`                            |

Fault 20 mutates the check's own file, which is what an architecture rule's negative fixture is: the
permitted-wildcard clause has no other production path. Faults 3 to 15 are production files.

Then write the reference assertion's `Proof:` comment and the `permitted` clause's, exactly as section 9.4
shows — those two comments describe only the faults this slice injects — and append to `verify.md` the
fourteen faults with the literal fragments observed and their evidence basenames
(`step-named-import.patch` and `.log`, `step-namespace-type.*`, `gateway-element-access.*`,
`capacity-barrel.*`, `capacity-import-type.*`, `renamed-export.*`, `default-export.*`,
`namespace-export.*`, `qualified-import-type.*`, `awaited-element-access.*`, `typeof-import-indexed.*`,
`awaited-property.*`, `two-hop-chain.*`, `barrel-permission-deleted.*`, and one
`…-restored-green.log` per restore). Only after those edits:

| Command                                                                          | Expect                                                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts`   | exit 0, `2 pass`, `0 fail`                                                                        |
| the step-0 count block, rerun                                                    | `proof-comments=6`, exit 0 (observed: the four that ship with the listing, plus this slice's two) |
| `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache` | exit 0                                                                                            |
| `(cd libs/wbs/application/core && bun test src)`                                 | exit 0, `C` passes over `F` files, unchanged (observed 543 over 54)                               |
| `GSETTINGS_BACKEND=memory bunx nx format:check --all`                            | exit 0                                                                                            |

Planner commit: `test(core): prove the project-event route rule can fail`.

### Slice 4 — Watch the declaration rule and the guards fail

**Step 0.** The same Bun count block as slice 3, then the type check and the focused test.

```sh
base=$(git rev-parse HEAD)
check=libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
count=$(bun -e 'const lines = (await Bun.file(Bun.argv[1]).text()).split("\n"); console.log(lines.filter((line) => /^\s*\/\/ Proof:/.test(line)).length);' "$check")
echo "proof-comments=$count"
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
```

Expect `proof-comments=6`, exit 0, then `2 pass`, `0 fail` (observed). Record `C` and `F` again — observed
`543` over 54 — and require them unchanged.

Inject section 6's faults 16 to 18 and 21 to 25, one at a time, with the same patch, restore and `cmp`
discipline. Faults 16 to 18 must leave `wbs-core:typecheck` at exit **0**; faults 21 to 25 need no type
check, and fault 24 fails it by construction, which its row records.

| Fault | Exact location and edit                                                                                                                                                                            | Expected result                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16    | `service/step.service.ts`: delete its port import and declare section 9.9's local `interface Broadcaster` directly above `export interface StepServiceOptions {`                                   | exit 1, `+ "service/step.service.ts: Broadcaster",`, `1 pass`, `1 fail`                                                                                             |
| 17    | `service/step.service.ts`: import the contract as `Broadcaster as Publisher`, write the field as `broadcast: Publisher;`, and add section 9.9's `namespace Broadcaster` above `StepServiceOptions` | exit 1, `+ "service/step.service.ts: Broadcaster",`, `1 pass`, `1 fail`                                                                                             |
| 18a   | `service/gateway-broadcaster.ts`: its one import drops `subscriptionFor` and section 9.9's local `const subscriptionFor` is declared beneath it                                                    | exit 1, `+ "service/gateway-broadcaster.ts: subscriptionFor",`, `1 pass`, `1 fail`                                                                                  |
| 18b   | the same file with section 9.9's destructured form in place of that `const`                                                                                                                        | exit 1, the same row, `1 pass`, `1 fail`                                                                                                                            |
| 21    | `ports/event-port-boundaries.test.ts`: ``const coreSource = `${coreRoot}src/runtime/`;``                                                                                                           | exit 1, `error: the program holds no ports/project-event.ts`, `0 pass`, `2 fail`                                                                                    |
| 22    | `ports/event-port-boundaries.test.ts`: ``const configPath = `${coreRoot}tsconfig.absent.json`;``                                                                                                   | exit 1, `error: Cannot read file '…/tsconfig.absent.json'.`, `0 pass`, `2 fail`                                                                                     |
| 23    | `libs/wbs/application/core/tsconfig.lib.json`: add `"module": "invalid"` beside `"declaration": true`                                                                                              | exit 1, `error: refused tsconfig.lib.json: 6046`, `0 pass`, `2 fail`                                                                                                |
| 23b   | that same malformed option **and** the statement beginning `if (parsed.errors.length > 0) {` deleted whole from `coreProgram`                                                                      | exit **0**, `2 pass`, `0 fail` — the false green the guard prevents. Restore both edits together                                                                    |
| 24    | `libs/wbs/application/core/src/ports/project-event.ts`: replace its whole contents with `const notAModule = 1;` and `void notAModule;`                                                             | exit 1, `error: ports/project-event.ts is not a module`, `0 pass`, `2 fail`. `wbs-core:typecheck` fails here too, and that is the recorded fact rather than a claim |
| 25    | `ports/event-port-boundaries.test.ts`: add `'ports/missing.ts'` to what `scannedSources` returns                                                                                                   | exit 1, `error: the program holds no ports/missing.ts`, `0 pass`, `2 fail`                                                                                          |

**Faults 23 and 24 mutate files outside this packet's permanent edit lane, and that is authorized here**:
they are the only way to reach those two guards, each file is restored with `cp` from a copy under
`"$TMPDIR"` and proved identical with `cmp` before anything else runs, and this slice's handoff lists
`libs/wbs/application/core/tsconfig.lib.json` and `…/src/ports/project-event.ts` as **unchanged**.

Then write the remaining four `Proof:` comments of section 9.4 — the declaration assertion's and the three
beside the guards `coreProgram` and `contractUses` hold — and append the eight faults to `verify.md` with
their evidence basenames (`step-local-interface.*`, `step-namespace-duplicate.*`,
`gateway-local-const.*`, `gateway-destructured.*`, `scan-root.*`, `config-absent.*`,
`config-malformed.*`, `config-guard-deleted.*`, `port-not-a-module.*`, `missing-scanned-source.*`, and one
`…-restored-green.log` each). Only after those edits:

| Command                                                                               | Expect                                |
| ------------------------------------------------------------------------------------- | ------------------------------------- |
| `bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts`        | exit 0, `2 pass`, `0 fail`            |
| the step-0 count block, rerun                                                         | `proof-comments=8`, exit 0 (observed) |
| `cmp libs/wbs/application/core/tsconfig.lib.json "$TMPDIR"/tsconfig.lib.json`         | exit 0                                |
| `cmp libs/wbs/application/core/src/ports/project-event.ts "$TMPDIR"/project-event.ts` | exit 0                                |
| `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache`      | exit 0                                |
| `(cd libs/wbs/application/core && bun test src)`                                      | exit 0, `C` over `F`, unchanged       |
| `GSETTINGS_BACKEND=memory bunx nx format:check --all`                                 | exit 0                                |

Planner commit: `test(core): prove the port's declaration rule and its guards can fail`.

### Slice 5 — The rule covers the tests too

**Step 0.** The same Bun count as slices 3 and 4, plus the filter this slice widens. `grep -cF --` reads a
pattern that starts with `-`; the file it reads is the one the count just read successfully.

```sh
base=$(git rev-parse HEAD)
check=libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
count=$(bun -e 'const lines = (await Bun.file(Bun.argv[1]).text()).split("\n"); console.log(lines.filter((line) => /^\s*\/\/ Proof:/.test(line)).length);' "$check")
echo "proof-comments=$count"
grep -cF -- ".filter((path) => path.endsWith('.ts') && !path.includes('.test.'))" "$check"
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
```

Expect `proof-comments=8`, then **1**, then exit 0 (observed). Record `C` and `F` again — observed `543`
over 54 — and require them unchanged: this slice adds no test file.

1. Change that one filter line to `.filter((path) => path.endsWith('.ts'))` and run the check. Expect the
   red of section 6 fault 2: exit 1, the 9 rows naming eight test files, `1 pass`, `1 fail`.
2. Apply section 9.6's eight one-line edits, then
   `GSETTINGS_BACKEND=memory bunx eslint --fix` on those eight paths → exit 0.
3. `bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts` → exit 0, `2 pass`,
   `0 fail` (observed).
4. Inject section 6 fault 19 — in `service/working-plan.test.ts` replace
   `import type { Broadcaster } from '../ports/project-event';` with
   `import type { Broadcaster } from './broadcast';` — and expect exit 1 with
   `+ "service/working-plan.test.ts: Broadcaster via service/broadcast.ts",`, `1 pass`, `1 fail`, and
   `wbs-core:typecheck` exit 0 with the fault in place (all observed). Save the patch as
   `working-plan-test-import.patch` with its `.log`, restore with `cp`, prove with `cmp`, rerun green into
   `working-plan-test-import-restored-green.log`.
5. Correct the first line of `scannedSources`' JSDoc, which slice 2 wrote as
   `Every production file of the core, as a path under \`src\`.`, to the wording section 9.4 shows. The
eight `Proof:` comments are already final and are not touched, so the count stays **8**.
6. `(cd libs/wbs/application/core && bun test src)` → exit 0 with `C` over `F` (observed `543 pass`,
   `0 fail`, 54 files); `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache`
   → exit 0; append the baselines, the red's 9 rows, the fault and the basenames to `verify.md`; then
   `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `refactor(core): name the port in every core test that publishes`.

### Slice 6 — Classification, the task note, and the close

**Step 0.** Both baselines this slice compares against are collected here: the classification count and
the OpenSpec item total. The task-note lookup needs `-F --`, because the pattern starts with `-`; without
`--` the reviewed tree printed `grep: invalid option -- ' '` and exited **2** (observed).

```sh
base=$(git rev-parse HEAD)
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
python3 -c "import json,sys; e=[x for x in json.load(open('docs/code-organization/kinds.json'))['entries'] if x['path']=='libs/wbs/application/core/src/service/broadcast.ts']; sys.exit(0 if len(e)==1 else 1)" \
  && echo "gate: one broadcast row"
tasks=openspec/changes/adopt-di-composition/tasks.md
test -f "$tasks" || { echo "no such file: $tasks" >&2; exit 65; }
grep -cF -- '- [ ] 1.2 Split `broadcast.ts`:' "$tasks"
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
```

Expect a number, the gate line, **1**, then exit 0 (all observed). Call the first number `K`. Then run the
README's strict OpenSpec validation block **before editing anything** and record
`jq -r '.summary.totals' "$report"` as `N` items, `N` passed, 0 failed; it was `113`/`113`/`0` on the
rehearsed tree, which is evidence and not the requirement. The end of this slice requires `K` and `N`
unchanged, because it opens no change and adds no classified file.

1. Rewrite the `service/broadcast.ts` entry **in place** as section 9.7 shows: same `path`, same `kind`,
   new `disposition` and `rationale`. **Add no entry** for `ports/project-event.ts` or
   `ports/event-port-boundaries.test.ts`: `service-kinds.ts:15-19` scans only
   `libs/wbs/application/core/src/service`, `…/src/use-cases` and `apps/wbs/be-01/src/service`, and a row
   for an unscanned path fails `every backend service file with no kind suffix is classified exactly once`.
2. Add the note of section 9.8 under task 1.2 in `openspec/changes/adopt-di-composition/tasks.md`.
   **Tick no box:** 1.2's second half, the collector's move into Plan commands, is not done and section 4
   says why.
3. Append to `verify.md`: `K` and `N` with their closing values, the port-and-adapter decision with its
   map citations, this slice's evidence basenames (`slice-5-kinds-baseline.txt`,
   `slice-5-kinds-final.txt`, the validation report's own basename), and these two findings by name, so
   later packets do not inherit them silently: **the collector's move waits for task 5.2** because
   `import.service.ts:147` builds one too, and **`ports/project-event.ts` keeps a type-only import of
   `../service/numbered-work-item`** until `tasks.md` 6.1 moves that file to the domain library.
4. `GSETTINGS_BACKEND=memory bunx prettier --write` on `docs/code-organization/kinds.json` and the two
   OpenSpec files, then `--check` the same paths → exit 0 (observed).

| Command                                                                                                | Expect                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| The README's strict OpenSpec validation block, `jq -s -e` contract included, rerun after the edits     | exit 0, and `jq -r '.summary.totals'` prints `N` items, `N` passed, 0 failed — the step-0 values (observed `113`/`113`/`0` before and after) |
| `python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"` | `K`, the step-0 value, unchanged (observed 95 → 95)                                                                                          |
| `NX_DAEMON=false bunx nx run-many -t typecheck,lint,test:unit -p wbs-core --skip-nx-cache`             | exit 0 (observed)                                                                                                                            |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`                                  | exit 0 (observed)                                                                                                                            |
| `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                      | exit 0 (observed)                                                                                                                            |
| `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-gw-01,wbs-mcp-01 --skip-nx-cache`                | exit 0 (observed). Neither app imports `@wbs/core`, which is why only the type check is asked of them here                                   |
| `GSETTINGS_BACKEND=memory bunx nx format:check --all`                                                  | exit 0 (observed)                                                                                                                            |

**`wbs-be-01:test:unit`, `wbs-be-01:test`, `wbs-gw-01:test`, `wbs-mcp-01:test`, `wbs-core:test`,
`wbs-core:test:portable` and `tool-devsync:test` are the planner's** — section 8 gives each one's reason
and the value observed. Do not run them, do not treat their absence as skipped checks, and say in
`verify.md` that they are pending planner verification with those values.

Planner commit: `chore(core): reclassify the broadcast shim as the collector's home`.

## 8. Planner-only checks

| Check                                                           | Why it is the planner's                                                                                                            | Value observed on the rehearsed tree                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-be-01:test:unit`               | `apps/wbs/be-01/src/app.routes.test.ts:548` calls `Bun.serve`, and the launcher dispatches with the network disabled               | exit 0, `519 pass`, `0 fail`, 49 files                                                              |
| `NX_DAEMON=false bunx nx run wbs-be-01:test`                    | Whole target: opens SQLite databases and includes that listener test                                                               | exit 0, `1091 pass`, `0 fail`, 92 files                                                             |
| `NX_DAEMON=false bunx nx run wbs-gw-01:test`                    | Binds loopback ports in its integration tests                                                                                      | exit 0, `128 pass`, `0 fail`, 17 files                                                              |
| `NX_DAEMON=false bunx nx run wbs-mcp-01:test`                   | Same reason                                                                                                                        | exit 0, `165 pass`, `0 fail`, 15 files                                                              |
| `NX_DAEMON=false bunx nx run wbs-core:test`                     | Planner integration verification of the whole target with coverage                                                                 | exit 0, `543 pass`, `0 fail`, 54 files                                                              |
| `NX_DAEMON=false bunx nx run wbs-core:test:portable`            | Runs Playwright; the executor has no browser. `build:portable` is the executor's and is what proves the port bundles for a browser | exit 0                                                                                              |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache` | Its index checker refuses untracked files, so it needs the slice staged or committed, and it spawns processes                      | `366 pass`, `0 fail` — unchanged, so the new port and check files move no inventory count or digest |
| `bin/h2puni-gate.sh <sha>`                                      | Takes the host-wide heavy lock                                                                                                     | pending planner verification                                                                        |

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun that
file once. Do not edit that test, and do not edit any test this packet does not name.

No slice adds a file under `apps/wiki/cli`, so the Twilight Burokrat validator identity does not move. No
slice adds a project, a target or a `docs/wiki-policy` row, so `pilot-policy.test.ts`'s pins do not move;
its run still belongs after the planner's commits because it reads the repository at `HEAD`.

## 9. Exact content

### 9.1 `libs/wbs/application/core/src/ports/project-event.ts`

Create it as: these four lines, a blank line, then **lines 7 to 215 of
`libs/wbs/application/core/src/service/broadcast.ts` byte for byte** (`ProjectEvent`'s JSDoc through
`Broadcaster`'s closing brace), with the two JSDoc edits below and nothing else changed. The file is 230
lines when finished (observed).

```ts
import type { ScheduleEngine, SolverFailureReason, SolverObjectiveName } from '@wbs/domain';

import type { NumberedWorkItem } from '../service/numbered-work-item';
import type { Step } from './step-store';
```

The moved block's own imports are what those four lines replace: the original file imports
`ScheduleEngine` and `SolverObjectiveName` on line 1 and `SolverFailureReason` on line 2, which
`simple-import-sort` wants as the one merged line above. `NumberedWorkItem` still comes from
`../service/numbered-work-item`: the map schedules that file for the domain library in `tasks.md` 6.1,
and until it moves the port keeps a type-only edge to it. Say so in `verify.md`; do not move it here.

**Edit one**, `subscriptionFor`'s JSDoc. Its middle sentence is false — gw-01 links no core code and uses
its own `PROJECT_SUBSCRIPTION` regular expression — so the paragraph becomes:

```ts
/**
 * The subscription name carrying a project's edits.
 *
 * One function rather than a template literal at each call site: be-01 records
 * events under this name and fe-01 subscribes with it. gw-01 imports nothing from
 * this library and takes the same prefix apart with its own regular expression in
 * `apps/wbs/gw-01/src/controller/ws.controller.ts`, so the string is spelled in
 * three places already and a fourth spelling is a silent no-op, not an error.
 */
```

**Edit two**, a JSDoc for `Broadcaster`, which has none today. It goes directly above
`export interface Broadcaster {`:

```ts
/**
 * Where a published project event goes.
 *
 * The neutral event port every resource and feature announces through, so that a
 * publisher depends on this contract and never on Realtime — the sideways edge K6
 * forbids, answered the way K6 says to answer it, "through a published event".
 * `GatewayBroadcaster` is its production adapter and `OptimizerTriggerBroadcaster`
 * decorates it; both are composition's business, not a publisher's.
 *
 * In `ports/` because it is a port with an adapter, as ADR 0014 pairs them. A
 * feature-service that imports it therefore carries the same preserved K3 debt as
 * one importing `ports/unit-of-work` or `ports/clock` today; the debt is recorded
 * in `openspec/changes/adopt-di-composition` and not closed here.
 */
```

### 9.2 `libs/wbs/application/core/src/service/broadcast.ts`

Its first 215 lines become exactly these six, and everything from the old line 217 on — the
`HeldAnnouncement` interface and the `AnnouncementCollector` class with all their JSDoc — stays byte for
byte. The file is 74 lines when finished (observed).

```ts
import type { Broadcaster, ProjectEvent } from '../ports/project-event';

// Compatibility exports: the event contracts moved to the neutral port and keep
// their `@wbs/core/service/broadcast` names while importers name the port.
export type { Broadcaster, ProjectEvent } from '../ports/project-event';
export { subscriptionFor } from '../ports/project-event';
```

### 9.3 `libs/wbs/application/core/src/index.ts`

Two insertions. Directly above `export * from './ports/project-store';`:

```ts
// The neutral project-event port: `Broadcaster`, `ProjectEvent` and `subscriptionFor`.
export * from './ports/project-event';
```

and directly above the existing `export * from './service/broadcast';`:

```ts
// Compatibility export: the event contracts keep their barrel names from the
// neutral port, and `AnnouncementCollector` still lives here.
```

Both star exports name the same declarations, which TypeScript accepts because they are one symbol; a
**second** declaration behind either of them is refused as `TS2308` (section 6).

### 9.4 `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts`

**The rule asks the type checker from three vantage points, and reads no export name in rule 1.** Four
reviews defeated four narrower designs: a regular-expression scanner, a syntax walk, an identity check that
still filtered exports by spelling, and an identifier-only identity check. What ships asks:

1. **Module references.** Every way a file can name a module — a namespace import, a wildcard or namespace
   re-export, `import … = require(…)`, an `import(…)` type, a dynamic `import(…)` call, a `require(…)` call —
   is resolved to its module symbol and reported when that module hands out a port symbol and is not the
   port. `export *` graphs are followed recursively under a visited set.
2. **Types.** Every element access, property access and indexed-access type whose **base type** is a module
   object other than the port and whose own **type** resolves to a port symbol is reported. That is what
   catches an awaited dynamic import indexed by a string, and a `typeof import(…)` indexed annotation, where
   no identifier ever carries the contract.
3. **Identifiers.** Every identifier whose alias chain ends at a port symbol is reported with the files it
   travelled through, and with the module its binding came from when that module is not the port. That is
   what catches named imports, renames, `default` re-exports, barrels and deep package paths.

Rule 2, the declaration rule, runs on **every** node as its own pass, never as the tail of a chain of
`else if`s: a `namespace Broadcaster {}` is both a module symbol and a prohibited declaration, and an
ordering that let the first answer stand exempted the second (round 4). It reports any declaration —
interface, type alias, class, function, enum, namespace, `const`, binding element, import or export alias —
that carries one of the port's exported names while not being the port's symbol, and those names come from
the port's own exports rather than from a list in this file.

**The contract, exactly as proven.** A reference whose checker-resolved symbol or type is one of the port's
exported symbols is reported unless it came from the port; a module that hands one out is reported unless it
is the port, with one stated permission — `index.ts` re-exporting `service/broadcast.ts`, the compatibility
barrel, which carries its own negative (section 6, fault 20). **Not covered, by design:** a new symbol that
merely mirrors a contract, such as `export type Publisher = Broadcaster;` or a structurally identical
interface under another name, is not a reference to the port at all; rule 2 sees it only if it takes one of
the port's names. Section 6 records both attempts among the ones that got through. That is a stated limit,
not a claim, and this packet no longer asserts anywhere that no spelling can bypass the rule.

It stays local to this test; `apps/wiki/cli/src/relationships/typescript.ts` is not touched, imported or
moved.

Slice 2 creates the file exactly as below **except** that its `.filter` line reads
`.filter((path) => path.endsWith('.ts') && !path.includes('.test.'))`, its `scannedSources` JSDoc first line
says `Every production file of the core, as a path under \`src\`.`, and the eight `Proof:`comments are
absent; slice 3 writes two of them, slice 4 the other six, and slice 5 widens the filter and corrects that
JSDoc line. The text below is the finished file, 357 lines, Prettier-clean, and it passes`wbs-core:typecheck`and`wbs-core:lint` (observed). It runs in about two seconds.

```ts
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
import ts from 'typescript';

const coreRoot = fileURLToPath(new URL('../..', import.meta.url));
const coreSource = `${coreRoot}src/`;
const configPath = `${coreRoot}tsconfig.lib.json`;
const portHome = 'ports/project-event.ts';
const collectorHome = 'service/broadcast.ts';
const barrelHome = 'index.ts';

function underSrc(fileName: string): string {
  return fileName.startsWith(coreSource) ? fileName.slice(coreSource.length) : fileName;
}

/** Every TypeScript file of the core, as a path under `src`. */
async function scannedSources(): Promise<readonly string[]> {
  return (await readdir(coreSource, { recursive: true }))
    .filter((path) => path.endsWith('.ts'))
    .map((path) => path.replaceAll('\\', '/'))
    .sort();
}

/**
 * The core compiled as one program, with its own `tsconfig.lib.json` options.
 *
 * Both throws are load-bearing: without the real options there are no path
 * mappings, `@wbs/domain` and `@wbs/contracts` do not resolve, and every symbol
 * this rule asks about comes back unresolved — which reads as an empty violation
 * list. They are not the wrong-root throw in {@link contractUses}: that one fires
 * when the program is built correctly over the wrong directory.
 */
function coreProgram(rootNames: readonly string[]): ts.Program {
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  // Proof: pointing `configPath` at `tsconfig.absent.json` threw
  // `Cannot read file '…/tsconfig.absent.json'.` and failed both tests, 0 pass and 2 fail (2026-09-22).
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, coreRoot);
  // Proof: `"module": "invalid"` in the real tsconfig.lib.json threw `refused tsconfig.lib.json: 6046`
  // and failed both tests, 0 pass and 2 fail; with this throw deleted the same malformed option left
  // both assertions passing on unresolved symbols, 2 pass and 0 fail (2026-09-22).
  if (parsed.errors.length > 0) {
    throw new Error(
      `refused tsconfig.lib.json: ${parsed.errors.map((each) => each.code).join(', ')}`,
    );
  }
  return ts.createProgram({
    rootNames: rootNames.map((path) => `${coreSource}${path}`),
    options: { ...parsed.options, noEmit: true },
  });
}

/** The end of an alias chain, and every symbol passed through on the way. */
function aliasChain(checker: ts.TypeChecker, symbol: ts.Symbol): readonly ts.Symbol[] {
  const chain = [symbol];
  let current = symbol;
  while ((current.flags & ts.SymbolFlags.Alias) !== 0) {
    const next = checker.getAliasedSymbol(current);
    if (chain.includes(next)) break;
    chain.push(next);
    current = next;
  }
  return chain;
}

function declarationFiles(symbol: ts.Symbol): readonly string[] {
  return (symbol.declarations ?? []).map((each) => underSrc(each.getSourceFile().fileName));
}

/** Every name a node declares, including the elements of a binding pattern. */
function declaredNames(node: ts.Node): readonly ts.Identifier[] {
  if (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isBindingElement(node) ||
    ts.isImportSpecifier(node) ||
    ts.isExportSpecifier(node) ||
    ts.isImportClause(node) ||
    ts.isNamespaceImport(node) ||
    ts.isNamespaceExport(node) ||
    ts.isImportEqualsDeclaration(node)
  ) {
    const name = ts.isImportClause(node) ? node.name : node.name;
    return name !== undefined && ts.isIdentifier(name) ? [name] : [];
  }
  return [];
}

/**
 * The module specifier that introduced a binding, if the identifier is one.
 *
 * A binding's module is what decides whether a contract was reached from the port
 * or from something that re-exports it, and `export * from` creates no alias for
 * the checker to follow — so the module has to be asked for directly.
 */
function moduleOfBinding(node: ts.Node): ts.Expression | undefined {
  let here = node;
  while (!ts.isSourceFile(here)) {
    if (ts.isImportDeclaration(here) || ts.isExportDeclaration(here)) return here.moduleSpecifier;
    if (ts.isImportTypeNode(here) && ts.isLiteralTypeNode(here.argument)) {
      return here.argument.literal;
    }
    if (ts.isImportEqualsDeclaration(here) && ts.isExternalModuleReference(here.moduleReference)) {
      return here.moduleReference.expression;
    }
    here = here.parent;
  }
  return undefined;
}

interface ContractUse {
  /** A reference that reached a port contract through something other than the port. */
  readonly reached: readonly string[];
  /** A declaration of a contract's name that is not the port's own. */
  readonly declared: readonly string[];
}

/**
 * What every file of the core does with the port's exported symbols.
 *
 * **Identity only: no export name is compared anywhere in rule 1.** A contract
 * renamed on the way out (`subscriptionFor as routeFor`), exported as `default`,
 * re-exported as a namespace (`export * as events`) or reached through a barrel is
 * the same symbol, and that is what this asks about. Rule 2 is the one that reads
 * names, because shadowing is a fact about names — and even there the names come
 * from the port's own exports rather than from a list in this file.
 *
 * What is proven: a reference that resolves to one of the port's symbols is caught
 * by identity, whatever it is spelled as and whatever route it took. What is not
 * in scope: a structurally identical copy declared under another name is not a
 * reference to the port at all, and rule 2 catches it only if it takes one of the
 * port's names.
 */
function contractUses(paths: readonly string[]): ContractUse {
  const program = coreProgram(paths);
  const checker = program.getTypeChecker();
  const portFile = program.getSourceFile(`${coreSource}${portHome}`);
  // Proof: pointing `coreSource` at `src/runtime/` made this throw
  // `the program holds no ports/project-event.ts` and failed both tests, 0 pass and 2 fail; it cannot be
  // deleted instead, because the narrowing below needs it (2026-09-22).
  if (portFile === undefined) throw new Error(`the program holds no ${portHome}`);
  const portModule = checker.getSymbolAtLocation(portFile);
  // Proof: replacing the port's contents with two statements and no export made this throw
  // `ports/project-event.ts is not a module` and failed both tests, 0 pass and 2 fail; `wbs-core:typecheck`
  // fails on that mutation too, because every importer loses its contracts (2026-09-22).
  if (portModule === undefined) throw new Error(`${portHome} is not a module`);
  const portSymbols = new Set(
    checker.getExportsOfModule(portModule).map((each) => {
      const chain = aliasChain(checker, each);
      return chain[chain.length - 1] ?? each;
    }),
  );
  const portNames = new Set([...portSymbols].map((each) => each.getName()));
  const reached: string[] = [];
  const declared: string[] = [];

  /** Whether a module hands out a port symbol, following `export *` graphs. */
  function handsOutContract(moduleSymbol: ts.Symbol, seen: Set<ts.Symbol>): boolean {
    if (seen.has(moduleSymbol)) return false;
    seen.add(moduleSymbol);
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const chain = aliasChain(checker, exported);
      const end = chain[chain.length - 1] ?? exported;
      if (portSymbols.has(end)) return true;
      if ((end.flags & ts.SymbolFlags.Module) !== 0 && handsOutContract(end, seen)) return true;
    }
    return false;
  }

  for (const path of paths) {
    const file = program.getSourceFile(`${coreSource}${path}`);
    // Proof: adding `'ports/missing.ts'` to what `scannedSources` returns made this throw
    // `the program holds no ports/missing.ts` and failed both tests, 0 pass and 2 fail (2026-09-22).
    if (file === undefined) throw new Error(`the program holds no ${path}`);
    if (path === portHome) {
      for (const exported of checker.getExportsOfModule(portModule)) {
        declared.push(`${path}: ${exported.getName()}`);
      }
      continue;
    }
    /** A module reference that exposes a whole module object, and the module it names. */
    function wholeModuleReference(node: ts.Node): ts.Expression | undefined {
      if (ts.isImportDeclaration(node)) {
        const bindings = node.importClause?.namedBindings;
        return bindings !== undefined && ts.isNamespaceImport(bindings)
          ? node.moduleSpecifier
          : undefined;
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
        const clause = node.exportClause;
        return clause === undefined || ts.isNamespaceExport(clause)
          ? node.moduleSpecifier
          : undefined;
      }
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        return node.moduleReference.expression;
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
        return node.argument.literal;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return node.arguments.length > 0 ? node.arguments[0] : undefined;
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        return node.arguments.length > 0 ? node.arguments[0] : undefined;
      }
      return undefined;
    }

    /** The source file a type's symbol is declared in, when that symbol is a module. */
    function moduleFileOfType(type: ts.Type): string | undefined {
      const symbol = type.aliasSymbol ?? type.getSymbol();
      if (symbol === undefined) return undefined;
      const resolvedSymbol = aliasChain(checker, symbol);
      const end = resolvedSymbol[resolvedSymbol.length - 1] ?? symbol;
      const declaration = end.declarations?.find((each) => ts.isSourceFile(each));
      return declaration === undefined ? undefined : underSrc(declaration.getSourceFile().fileName);
    }

    /** Whether a type is one of the port's contracts, by the symbol the checker gives it. */
    function isPortType(type: ts.Type): boolean {
      for (const candidate of [type.aliasSymbol, type.getSymbol()]) {
        if (candidate === undefined) continue;
        const chain = aliasChain(checker, candidate);
        const end = chain[chain.length - 1] ?? candidate;
        if (portSymbols.has(end)) return true;
      }
      return false;
    }

    const visit = (node: ts.Node): void => {
      const exposed = wholeModuleReference(node);
      if (exposed !== undefined) {
        const moduleSymbol = checker.getSymbolAtLocation(exposed);
        if (moduleSymbol !== undefined) {
          const chain = aliasChain(checker, moduleSymbol);
          const end = chain[chain.length - 1] ?? moduleSymbol;
          const from = declarationFiles(end)[0];
          // The compatibility barrel is the one permitted wildcard: `index.ts` re-exports the
          // collector's file, which re-exports the contracts, and that is what keeps every
          // `@wbs/core` name working while the collector lives there.
          // Proof: deleting this `permitted` clause made the rule report
          // `index.ts: './service/broadcast' hands out the contracts from service/broadcast.ts`,
          // 1 pass and 1 fail (2026-09-22).
          const permitted = path === barrelHome && from === collectorHome;
          if (!permitted && from !== portHome && handsOutContract(end, new Set())) {
            reached.push(`${path}: ${exposed.getText()} hands out the contracts from ${from}`);
          }
        }
      }
      if (
        ts.isElementAccessExpression(node) ||
        ts.isPropertyAccessExpression(node) ||
        ts.isIndexedAccessTypeNode(node)
      ) {
        const base = ts.isIndexedAccessTypeNode(node) ? node.objectType : node.expression;
        const baseModule = moduleFileOfType(checker.getTypeAtLocation(base));
        if (
          baseModule !== undefined &&
          baseModule !== portHome &&
          isPortType(checker.getTypeAtLocation(node))
        ) {
          reached.push(`${path}: ${node.getText()} reads a contract out of ${baseModule}`);
        }
      }
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol !== undefined) {
          const chain = aliasChain(checker, symbol);
          const end = chain[chain.length - 1] ?? symbol;
          if (portSymbols.has(end)) {
            const route = new Set(
              chain
                .slice(0, -1)
                .flatMap((each) => declarationFiles(each))
                .filter((file) => file !== path && file !== portHome),
            );
            const binding = moduleOfBinding(node);
            if (binding !== undefined) {
              const bound = checker.getSymbolAtLocation(binding);
              const boundFile =
                bound === undefined ? binding.getText() : declarationFiles(bound)[0];
              if (boundFile !== portHome) route.add(boundFile);
            }
            if (route.size > 0) {
              reached.push(`${path}: ${node.getText()} via ${[...route].sort().join(', ')}`);
            }
          } else if ((end.flags & ts.SymbolFlags.Module) !== 0) {
            const from = declarationFiles(end)[0];
            if (from !== portHome && handsOutContract(end, new Set())) {
              reached.push(`${path}: ${node.getText()} hands out the contracts from ${from}`);
            }
          }
        }
      }
      // Rule 2 runs on every node, never as the tail of a chain of `else if`s: a `namespace
      // Broadcaster {}` is both a module symbol and a prohibited declaration, and an ordering that
      // let the first answer stand exempted the second (round 4).
      for (const name of declaredNames(node)) {
        const symbol = checker.getSymbolAtLocation(name);
        if (symbol === undefined) continue;
        if (!portNames.has(name.text)) continue;
        const chain = aliasChain(checker, symbol);
        const end = chain[chain.length - 1] ?? symbol;
        if (!portSymbols.has(end) && declarationFiles(symbol).includes(path)) {
          declared.push(`${path}: ${name.text}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { reached: [...new Set(reached)].sort(), declared: [...new Set(declared)].sort() };
}

describe('the neutral project-event port', () => {
  it('is where every reference to the event contracts comes from', async () => {
    // Proof: thirteen routes into the contracts each failed here with `wbs-core:typecheck` exit 0 — a
    // named import and an `import` type through service/broadcast.ts; a type-only namespace of it; a
    // value namespace of it read by element access; a barrel import through index.ts; an awaited dynamic
    // import consumed as a property and, separately, by element access; a `typeof import(…)` indexed
    // type; a rename (`subscriptionFor as routeFor`); a `default` re-export; an `export * as events`
    // namespace consumed as a nested property and as a qualified `import` type; and a two-hop
    // re-export chain, which named both hops. Reported as `<file>: <name> via <route>`,
    // `<file>: <specifier> hands out the contracts from <route>`, or
    // `<file>: <expression> reads a contract out of <route>` (2026-09-22).
    expect(contractUses(await scannedSources()).reached).toEqual([]);
  }, 120_000);

  it('holds the only declaration of each event contract', async () => {
    // Proof: four second declarations each failed here with `wbs-core:typecheck` exit 0 — a local
    // `interface Broadcaster` and a `namespace Broadcaster` in service/step.service.ts, and a local
    // `const subscriptionFor` and a destructured `subscriptionFor` in service/gateway-broadcaster.ts,
    // all reported as `<file>: <name>`. The namespace is why this pass runs on every node instead of
    // in an `else if` chain after the module-reference rule, which exempted it (2026-09-22).
    expect(contractUses(await scannedSources()).declared).toEqual([
      `${portHome}: Broadcaster`,
      `${portHome}: ProjectEvent`,
      `${portHome}: subscriptionFor`,
    ]);
  }, 120_000);
});
```

### 9.5 Slice 2's seventeen production edits

In each file, delete the import that names a contract from `broadcast` and put the replacement in the
sorted position named below. `GSETTINGS_BACKEND=memory bunx eslint --fix <file>` moves a line written in
the old position to exactly these places (observed on all of them).

| File                                        | Delete                                                                                | Insert directly above                                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.ts`                                | `import type { Broadcaster } from './service/broadcast';`                             | `import type { PushTransport } from './ports/push-transport';` → `import type { Broadcaster } from './ports/project-event';`                                                                                              |
| `http/saved-plan.routes.ts`                 | `import type { Broadcaster } from '../service/broadcast';`                            | `import type { ProjectService } from '../service/project.service';` → `import type { Broadcaster } from '../ports/project-event';`                                                                                        |
| `service/calendar-marker.service.ts`        | `import type { Broadcaster } from './broadcast';`                                     | `import type { ProjectStore } from '../ports/project-store';` → `import type { Broadcaster } from '../ports/project-event';`                                                                                              |
| `service/capacity.service.ts`               | the same line                                                                         | the same anchor and replacement                                                                                                                                                                                           |
| `service/priority-band.service.ts`          | the same line                                                                         | the same anchor and replacement                                                                                                                                                                                           |
| `service/step.service.ts`                   | the same line                                                                         | the same anchor and replacement                                                                                                                                                                                           |
| `service/directory.service.ts`              | the same line                                                                         | `import type { ExternalSystem, Service, Tag, WorkItemType } from '../ports/work-item-store';` → `import type { Broadcaster } from '../ports/project-event';`                                                              |
| `service/project.service.ts`                | the same line                                                                         | the multi-line `import type {` that follows `'../ports/clock'` → `import type { Broadcaster } from '../ports/project-event';`                                                                                             |
| `service/work-item.service.ts`              | the same line                                                                         | `import type { Project, ProjectStore } from '../ports/project-store';` → `import type { Broadcaster } from '../ports/project-event';`                                                                                     |
| `service/gateway-broadcaster.ts`            | `import { type Broadcaster, type ProjectEvent, subscriptionFor } from './broadcast';` | `import type { PushTransport } from '../ports/push-transport';` → `import { type Broadcaster, type ProjectEvent, subscriptionFor } from '../ports/project-event';`                                                        |
| `service/optimizer-trigger-broadcaster.ts`  | `import type { Broadcaster, ProjectEvent } from './broadcast';` (line 1)              | line 1 becomes `import type { Broadcaster, ProjectEvent } from '../ports/project-event';`                                                                                                                                 |
| `service/import.service.ts`                 | `import { AnnouncementCollector, type Broadcaster } from './broadcast';`              | in its place `import { AnnouncementCollector } from './broadcast';`, and above `import type { Scheduler } from '../ports/scheduler';` → `import type { Broadcaster } from '../ports/project-event';`                      |
| `service/plan-commands.ts`                  | `import { AnnouncementCollector, type Broadcaster } from './broadcast';`              | in its place `import { AnnouncementCollector } from './broadcast';`, and above `import type { Decision, Scope, UnitOfWork } from '../ports/unit-of-work';` → `import type { Broadcaster } from '../ports/project-event';` |
| `testing/broadcast-fixture.ts`              | `import type { Broadcaster, ProjectEvent } from '../service/broadcast';` (line 1)     | line 1 becomes `import type { Broadcaster, ProjectEvent } from '../ports/project-event';`                                                                                                                                 |
| `testing/import-service-source-contract.ts` | the same line                                                                         | `import type { ProjectStore } from '../ports/project-store';` → `import type { Broadcaster, ProjectEvent } from '../ports/project-event';`                                                                                |
| `testing/writes-fixture.ts`                 | `import type { Broadcaster } from '../service/broadcast';`                            | `import type { TransactionalStores } from '../ports/stores';` → `import type { Broadcaster } from '../ports/project-event';`                                                                                              |
| `use-cases/save-plan.ts`                    | `import type { Broadcaster } from '../service/broadcast';`                            | `import type { AuthenticatedUser } from '../service/auth.service';` → `import type { Broadcaster } from '../ports/project-event';`                                                                                        |

All paths are under `libs/wbs/application/core/src/`. Nothing but the import line changes in any of
them: no call site, no type annotation and no JSDoc.

### 9.6 Slice 4's eight test edits

| File                                            | Delete                                                                    | Insert directly above                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.test.ts`                               | `import type { Broadcaster } from './service/broadcast';`                 | `import type { Scope } from './ports/unit-of-work';` → `import type { Broadcaster } from './ports/project-event';`                                                                                                    |
| `service/broadcast.test.ts`                     | `import { AnnouncementCollector, type ProjectEvent } from './broadcast';` | in its place `import { AnnouncementCollector } from './broadcast';`, and above `import type { Project, ProjectStore } from '../ports/project-store';` → `import type { ProjectEvent } from '../ports/project-event';` |
| `service/estimate.test.ts`                      | `import type { ProjectEvent } from './broadcast';`                        | `import type { AvailableWorkItemService as WorkItemService } from '../testing/available-work-item-service';` → `import type { ProjectEvent } from '../ports/project-event';`                                          |
| `service/gateway-broadcaster.test.ts`           | `import { type ProjectEvent, subscriptionFor } from './broadcast';`       | `import type { PushTransport } from '../ports/push-transport';` → `import { type ProjectEvent, subscriptionFor } from '../ports/project-event';`                                                                      |
| `service/optimizer-trigger-broadcaster.test.ts` | `import type { ProjectEvent } from './broadcast';`                        | `import { recordingBroadcaster } from '../testing/broadcast-fixture';` → `import type { ProjectEvent } from '../ports/project-event';`                                                                                |
| `service/plan-command-scope.test.ts`            | `import type { Broadcaster } from './broadcast';`                         | `import type { PlanTransactionalStores } from '../ports/stores';` → `import type { Broadcaster } from '../ports/project-event';`                                                                                      |
| `service/plan-commands.test.ts`                 | the same line                                                             | the same anchor and replacement                                                                                                                                                                                       |
| `service/working-plan.test.ts`                  | the same line                                                             | the same anchor and replacement                                                                                                                                                                                       |

### 9.7 `docs/code-organization/kinds.json`

The entry whose `path` is `libs/wbs/application/core/src/service/broadcast.ts` keeps that path and its
`support` kind, and its `disposition` and `rationale` are replaced:

```json
    {
      "path": "libs/wbs/application/core/src/service/broadcast.ts",
      "kind": "support",
      "disposition": "Plan commands' batch announcement collector; move it there with task 5.2",
      "rationale": "import.service.ts and plan-commands.ts collect announcements through it, and the event contracts it re-exports for compatibility now live in ports/project-event.ts"
    },
```

The entry count is 95 before and 95 after (observed), and `tool-devsync:test` stayed at `366 pass`,
`0 fail`.

### 9.8 The note under task 1.2

Add these four lines directly under task 1.2 in
`openspec/changes/adopt-di-composition/tasks.md`, at the same indentation its continuation lines use, and
leave the checkbox unticked:

```md
      Port landed 2026-09-22 as `libs/wbs/application/core/src/ports/project-event.ts`, with
      `ports/event-port-boundaries.test.ts` as its checked rule. The collector stays in
      `service/broadcast.ts` and moves with 5.2: `import.service.ts:147` builds one too, so Plan
      commands cannot own it privately before that module exists without a K6 feature-to-feature edge.
```

### 9.9 The listings the negative slices inject

Only as faults, never as prescriptions. **Fault 4**, the type-only namespace, replaces
`service/step.service.ts`' port import with `import type * as events from './broadcast';` and its single
`broadcast: Broadcaster;` field with `broadcast: events.Broadcaster;`. **Fault 5**, the element access,
replaces `service/gateway-broadcaster.ts`' one import line with:

```ts
import type { Broadcaster, ProjectEvent } from '../ports/project-event';
import * as events from './broadcast';

const pushTo = events['subscriptionFor'];
```

and both of that file's `subscriptionFor(projectId)` calls with `pushTo(projectId)`. The element access is
written through that local alias rather than inline because the repository's own link checker reads a
bracketed string followed immediately by a parenthesised argument in a Markdown document as a link and fails
`every routed current document resolves its local links and anchors` (observed 2026-09-22).

**Fault 7**, the `import` type, is `service/capacity.service.ts`' single field becoming:

```ts
broadcast: import('./broadcast').Broadcaster;
```

**Faults 8 to 11** add one line to `service/optimizer-trigger-broadcaster.ts`, directly below its
`'../ports/project-event'` import — one of:

```ts
export { subscriptionFor as routeFor } from '../ports/project-event';
```

```ts
export { subscriptionFor as default } from '../ports/project-event';
```

```ts
export * as events from '../ports/project-event';
```

and replace `service/gateway-broadcaster.ts`' one import line with the pair below (fault 9 uses
`import pushTo from './optimizer-trigger-broadcaster';` instead of the namespace):

```ts
import type { Broadcaster, ProjectEvent } from '../ports/project-event';
import * as routes from './optimizer-trigger-broadcaster';
```

Both of that file's `subscriptionFor(projectId)` calls become `routes.routeFor(projectId)` for fault 8,
`pushTo(projectId)` for fault 9, and `routes.events.subscriptionFor(projectId)` for fault 10. **Fault 11**
keeps the `export * as events` line and writes `service/capacity.service.ts`' field as:

```ts
broadcast: import('./optimizer-trigger-broadcaster').events.Broadcaster;
```

**Fault 12**, the awaited element access, keeps only the type import in `service/gateway-broadcaster.ts` and
puts these two lines in place of its `const subscription = subscriptionFor(projectId);`, with the file's
other call replaced by the subscription name written inline:

```ts
const pushTo = (await import('./broadcast'))['subscriptionFor'];
const subscription = pushTo(projectId);
```

**Fault 13**, the indexed `typeof import`, keeps the port import and adds beneath it:

```ts
const pushTo: (typeof import('./broadcast'))['subscriptionFor'] = subscriptionFor;
```

with both calls becoming `pushTo(projectId)`. **Fault 14** is fault 12 with the property form:

```ts
const loaded = await import('./broadcast');
const subscription = loaded.subscriptionFor(projectId);
```

**Fault 15**, the two-hop chain, adds to `service/optimizer-trigger-broadcaster.ts`:

```ts
export type { Broadcaster as Hop } from './broadcast';
```

and `service/capacity.service.ts` imports `import type { Hop as Broadcaster } from './optimizer-trigger-broadcaster';`
in place of its port import.

**Fault 16**, the second interface, goes directly above `export interface StepServiceOptions {` in
`service/step.service.ts` once its port import is deleted:

```ts
interface Broadcaster {
  publish(projectId: string, event: unknown): Promise<void>;
  latestSeq(projectId: string): Promise<number>;
}
```

**Fault 17**, the duplicate namespace, imports the contract as `Broadcaster as Publisher`, writes the field
as `broadcast: Publisher;`, and adds above `StepServiceOptions`:

```ts
namespace Broadcaster {
  export const version = 1;
}
```

**Faults 18a and 18b** drop `subscriptionFor` from `service/gateway-broadcaster.ts`' import and declare it
again, first plainly and then through a binding pattern:

```ts
import type { Broadcaster, ProjectEvent } from '../ports/project-event';

const subscriptionFor = (projectId: string): string => `project:${projectId}`;
```

```ts
import type { Broadcaster, ProjectEvent } from '../ports/project-event';

const { subscriptionFor } = {
  subscriptionFor: (projectId: string): string => `project:${projectId}`,
};
```

**Fault 24**, the port that is not a module, replaces the whole of
`libs/wbs/application/core/src/ports/project-event.ts` with:

```ts
const notAModule = 1;
void notAModule;
```

## 10. Ready to commit

Each slice ends in its own planner commit, so there is no single final `git status`. Each slice records
`base=$(git rev-parse HEAD)` in step 0 and hands over `git diff --name-only "$base"` plus
`git ls-files --others --exclude-standard`, which the planner's own commits cannot break. Every list
includes the slice's `verify.md` append, because that edit is prescribed and a handoff without it would
contradict the slice.

| Slice | `git diff --name-only "$base"` adds                                                                                                                    | Untracked adds                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1     | `libs/wbs/application/core/src/service/broadcast.ts`, `…/src/index.ts`, `openspec/changes/adopt-di-composition/verify.md`                              | `libs/wbs/application/core/src/ports/project-event.ts`              |
| 2     | the seventeen files of section 9.5, `openspec/changes/adopt-di-composition/verify.md`                                                                  | `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts` |
| 3     | `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts`, `openspec/changes/adopt-di-composition/verify.md`                                 | nothing                                                             |
| 4     | the same two paths                                                                                                                                     | nothing                                                             |
| 5     | the eight files of section 9.6, `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts`, `openspec/changes/adopt-di-composition/verify.md` | nothing                                                             |
| 6     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`               | nothing                                                             |

Slices 4 and 5 restore `libs/wbs/application/core/tsconfig.lib.json` and
`libs/wbs/application/core/src/ports/project-event.ts` byte for byte after faults 23 and 24, so neither
appears in any handoff.

Twenty-nine files under `libs/wbs/application/core/src` — 17 production importers, 8 test importers,
`broadcast.ts`, `index.ts`, the port and its check — plus `docs/code-organization/kinds.json`,
`openspec/changes/adopt-di-composition/tasks.md` and `…/verify.md`: **32 paths**, every one of them
rehearsed, including the task note. Measured with every slice applied in order and staged:
`git diff --cached --name-only | wc -l` printed **32** (observed 2026-09-22). Subjects are the six named in section 7. Never `--no-verify`.

## 11. Global stop conditions

These are not preconditions — each slice's own step 0 holds those. Stop on any of the following.

- A red checkpoint passes, or reports `0 tests ran`.
- A mutation leaves its named test passing. That is first a location mistake: restore, check the location
  against section 9, redo once, and stop if it still passes.
- A count moves that this packet does not predict: the core file count, `K`, the OpenSpec item total.
- An Nx target outlives the tool's wait. It is STILL RUNNING, not failed: poll it under a
  status-recording wrapper.
- A command needs the network, or an OpenSpec invocation tries to download.
- A step-0 line does not print what it says.
- Any check this packet names is unavailable. Report the block; never skip it silently.

## 12. Recorded assumptions

1. **The event contracts are a port, not a module.** Section 4 cites the map and the design for it. No
   module identifier is allocated by this packet, so the addendum's grammar question does not arise; the
   module that will own the implementation is Realtime, and being a library module it will be
   `module.application.realtime` with the DI Bag label `application.realtime`.
2. **`ports/project-event.ts` keeps a type-only import of `../service/numbered-work-item`.** The event
   union has carried `NumberedWorkItem` since it was written, and the map moves that file to the domain
   library under `tasks.md` 6.1. Moving it here would double this packet; the port's own `verify.md`
   entry records the edge so 6.1's author finds it.
3. **The collector stays, and task 1.2 stays unticked.** Section 4 gives the measured reason and section
   9.8 the note that records it.
4. **`apps/wbs/be-01` is not edited.** Its shim re-exports `@wbs/core/service/broadcast`, which still
   carries all five names, and its tests keep importing through it. Widening this packet into be-01 would
   add a project whose unit target the executor cannot run.
5. **The new check lives beside the port rather than in `service/`.** `service-boundaries.test.ts` is a
   lint harness over a hand-kept list of service files; this rule is about where three contracts are
   named, so it belongs with the contracts and is named after them.
6. **Wildcard re-exports are not themselves checked; their consumers are.** `index.ts` re-exporting
   `service/broadcast.ts` is the one permitted module reference, stated in section 9.4 and proven by section
   6's fault 20; every file that reaches a contract **through** that barrel is reported (fault 6). No other
   exception exists in the check.
7. **The rule is about references to the port's symbols, not about resemblance.** A new symbol that
   mirrors a contract — `export type Publisher = Broadcaster;`, or a structurally identical interface under
   another name — passes rule 1 by design and passes rule 2 unless it takes a port name. Section 6 records
   both attempts, section 9.4 states the limit, and review is what catches them.
8. **No `tsconfig.json` and no isolated type-check target.** `tasks.md` 7.3 carries that work with its own
   proof, and adding an Nx target would move `tools/tool-devsync/src/workspace-inventory.test.ts` counts.

## 13. Corrections this packet makes, and what it found wrong

| Where                                                                 | Finding                                                                                                                                                                                                                                                                                            | Disposition                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `docs/code-organization/kinds.json`, the `service/broadcast.ts` row   | Its disposition said "move to the realtime module", which contradicts the map twice: preparation 1 sends the contracts to a neutral port and the Realtime row says Realtime "does not own the event union or Plan commands' collector"                                                             | Rewritten in place by slice 5 (section 9.7)                                    |
| `libs/wbs/application/core/src/service/broadcast.ts:196-198`          | `subscriptionFor`'s JSDoc says gw-01 "matches sockets against it". gw-01 imports nothing from `@wbs/core` and parses the prefix with its own `PROJECT_SUBSCRIPTION` at `apps/wbs/gw-01/src/controller/ws.controller.ts:68`                                                                         | Corrected by slice 1 as part of the move (section 9.1, edit one)               |
| Map, required preparation 1                                           | It sends `AnnouncementCollector` into Plan commands "as batch-private support" without noticing `import.service.ts:147`, a **second feature**, which builds one; doing that before Plan commands exists would create the K6 edge the same map forbids                                              | Deferred to `tasks.md` 5.2 with the note of section 9.8; the map should say so |
| Map, "Portable core: 50/50" and preparation 1                         | Both call the split one item, but the two halves have different owners and different earliest dates. Measured: the port half touches 25 importers and lands now; the collector half cannot land before Plan commands                                                                               | Recorded here; a later map revision should split the line                      |
| Packet A's code, `libs/wbs/application/core/src/module/plan-history/` | Nothing wrong found. Its six files — five TypeScript files and its README — the shim at `service/history.service.ts`, the `compose.ts` installation and the `index.ts` compatibility exports are as its section 10 prescribes, and `wbs-core:test` is green at `543 pass` with this packet applied | No action                                                                      |

## 14. Disposition of review 1 — historical

**Superseded where it describes the check.** Round 3 replaced the implementation again, so this table's
descriptions of `ts.createSourceFile`, recorded namespace aliases, `PropertyAccessExpression`, reported
non-string specifiers and the fault numbers 6 and 7 refer to versions that no longer exist. Section 9.4 and
section 6 are the only current description; the rows are kept because the findings themselves stay closed.

| Finding                                                  | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical 1** — the `Proof:` counts are wrong           | **FIXED.** The listing's introductory comment is gone with the regular expressions, and the count now matches only lines beginning `// Proof:`, behind a `test -f` gate because ugrep exits 1 for a missing file too. Rehearsed three ways: `proof-comments=3` on the finished check, `proof-comments=0` on a file with none, exit **65** on a missing path. Slices 3 and 4 both use that block, and slice 3's step 0 expects `proof-comments=0`.                                                                                                                                                                                                                                                                             |
| **Critical 2** — slice 5's step-0 lookup is invalid      | **FIXED.** Reproduced: without `--` the pattern's leading `-` gave `grep: invalid option -- ' '` and exit 2. Slice 5 now runs `grep -cF -- '- [ ] 1.2 Split \`broadcast.ts\`:' openspec/changes/adopt-di-composition/tasks.md`, which printed **1** at exit 0 (observed), and the step says why `--` is needed.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Critical 3** — the boundary rule had false greens      | **FIXED by rewriting the prescribed code.** Section 9.4 now parses each file with the installed TypeScript 6.0.2 (`ts.createSourceFile`, then a walk over `ImportDeclaration`, `ExportDeclaration`, `ImportTypeNode`, `QualifiedName` and `PropertyAccessExpression` against recorded namespace aliases, plus interface, type, class, function, enum and variable declarations), states its permitted forms, and resolves every specifier against the port. All four of the reviewer's escapes are now watched negatives — faults 3, 4, 5 and 7 of section 6 — each rehearsed with `wbs-core:typecheck` exit 0 beside it. The check stays inside the test file; `apps/wiki/cli/src/relationships/typescript.ts` is untouched. |
| **Important 4** — missing captures became success        | **FIXED.** The `?? ''` and the ignored declaration name are gone with the regular expressions. The parser walk defaults no value: a clause without named bindings and a re-export without a module are TypeScript's own optional syntax and are handled as those cases, and a module specifier that is not a string literal is **reported into the assertion** rather than skipped, so a malformed tree fails the rule.                                                                                                                                                                                                                                                                                                       |
| **Important 5** — the production negative used a fixture | **FIXED.** The duplicate-declaration negatives are now `service/step.service.ts` declaring a local `interface Broadcaster` (fault 6) and `service/gateway-broadcaster.ts` declaring a local `const subscriptionFor` (fault 7) — both publishers, both with `wbs-core:typecheck` exit 0. No fault in section 6 touches `testing/broadcast-fixture.ts` any more, and section 6's opening sentence now states truthfully that faults 2 to 7 are production files.                                                                                                                                                                                                                                                                |
| **Important 6** — no local OpenSpec baseline             | **FIXED.** Slice 5's step 0 runs the strict validation block **before** editing and records `N` items, `N` passed, 0 failed beside `K`; the closing table requires the step-0 `N`, with `113`/`113`/`0` kept only as observed evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Important 7** — the required evidence was undefined    | **FIXED.** Slice 5 step 3 names the two findings to record — the collector's move waiting for task 5.2 because `import.service.ts:147` builds one too, and the port's type-only `../service/numbered-work-item` edge pending `tasks.md` 6.1 — and names its evidence basenames. Slices 3 and 4 name theirs too.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Minor 8** — the path count contradicted the rehearsal  | **FIXED by rehearsing the last path.** The task note is now rehearsed as well, and with all five slices applied and staged `git diff --cached --name-only \| wc -l` printed **32** (observed). Section 10 states 32 prescribed and rehearsed paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**New facts this revision measured**, beyond the review: TypeScript 6.0.2 is installed as
`npm:@typescript/typescript6@6.0.2` and `apps/wbs/fe-01/src/deadline-copy.test.ts:4` already imports it, so
a parser-based rule needs no new dependency and passes `wbs-core:lint`; `grep` here is ugrep, which exits
**1** for a missing input file as well as for zero matches, so `|| test $? -eq 1` cannot distinguish them;
and `set -euo pipefail` aborted on a failed capture in a script file but not in an inline `bash -c`
compound, so this packet branches on captured statuses instead of trusting `set -e`. The whole-target
values were re-observed on the parser version: `wbs-core:test` 543 pass over 54 files,
`wbs-be-01:test:unit` 519 pass over 49 files, `tool-devsync:test` 366 pass, `build:portable`, all four
type checks and `nx format:check --all` exit 0.

## 15. Disposition of review 2 — historical where it describes the check

The findings stay closed, but round 3 replaced the implementation once more: read section 9.4 and section 6
for what the check now is, and section 16 for what changed.

Review 2 closed every round-one finding but Critical 3, which it downgraded to PARTLY with two more
bypasses. The answer is not two more cases; it is a different kind of check.

| Finding                                                        | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical 1** — the syntax walk still produces false greens   | **FIXED by changing the approach.** Section 9.4 is now **semantic**: one `ts.Program` over the core's `tsconfig.lib.json` options, `getSymbolAtLocation`, `getAliasedSymbol` and `getExportsOfModule`, with two rules stated as permissions — a contract may be bound only from a module that resolves to the port, and only the port may declare a contract's name. Both of the review's bypasses now fail: a value namespace read by element access gives `service/gateway-broadcaster.ts: all of './broadcast' which hands out Broadcaster, ProjectEvent, subscriptionFor`, and `const { subscriptionFor } = { … }` gives `service/gateway-broadcaster.ts: subscriptionFor`, each with `wbs-core:typecheck` exit 0. Wildcard re-exports are no longer ignored: they are wholesale bindings, reported unless they are the one permitted compatibility barrel, whose exception has its own negative (fault 11). Nine negatives in total, all rehearsed; section 6 also lists the five further forms the author attacked it with — package specifier, `export * as`, an indexed `typeof import(…)`, a `namespace` block, and an indirection through a third file that re-exports the port — every one of them caught, and the one that got through (a copy under a different name), stated plainly. |
| **Important 2** — the collector-presence check had no negative | **FIXED by deleting it.** The second required path was unreachable behind the first, so R5 says it goes rather than stay unprovable. `scannedSources` now asserts nothing, and the one remaining guard — the port missing from the program — has its negative (fault 10, `error: the program holds no ports/project-event.ts`, 0 pass and 2 fail) and cannot be deleted in its place, because the narrowing after it needs it. `collectorHome` survives only as the permitted-wildcard exception, which fault 11 proves.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Minor 3** — Packet A's directory has six files               | **FIXED.** Section 13's row now says "six files — five TypeScript files and its README".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Minor 4** — the grep claim and the ungated counts            | **FIXED.** Sections 3 and 6 now say ugrep is what the rehearsal host has and GNU grep 3.11 is what the reviewer's has, and that the zero-match tolerance belongs to the proof-comment blocks. The ungated counts are gone: slices 1, 2 and 5 now `test -f` every file they count before counting it, so neither implementation can turn a missing file into a number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**Dispatchable now.** Slices 1 and 2 are dispatchable as written: their preconditions, baselines, exact
edits, red and green counts, handoff and commit subject are complete and were rehearsed in order on one
tree, and slice 2's red is the rule failing on the tree slice 1 leaves. Slices 3, 4 and 5 are complete and
rehearsed too, and become dispatchable as their predecessors land, because each step 0 reads the previous
slice's result rather than an absolute fact.

**One more repository fact this revision cost:** `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`
reads a bracketed string followed immediately by a parenthesised argument in any routed Markdown document
as a link, so a packet that quotes an element-access call inline fails
`every routed current document resolves its local links and anchors` and
`every current document that trips a check carries an exemption for that check` — observed as
`040-6-b-broadcast-event-port.md -> projectId (absent …/projectId)`, `364 pass`, `2 fail`. Section 9.9's
fault 5 therefore names the element access through a local alias, and the packet quotes no such call
inline; with that done `tool-devsync:test` is `366 pass`, `0 fail` with the packet staged (observed).

**New facts this revision measured:** the semantic check costs about 1.6 seconds for the whole file, so the
two assertions carry explicit `120_000` timeouts; `wbs-core:lint` refuses
`const argument = node.arguments[0]; if (argument !== undefined)` with `no-unnecessary-condition`, so the
dynamic-import branch iterates the argument list; resolving a named binding needs the **module** symbol and
not the local symbol's declarations — the first semantic draft passed a plain named import and a barrel
import because it inspected the local alias, and both are now rehearsed negatives (faults 3 and 6).

## 16. Disposition of round 3 — historical where it describes the check

The findings stay closed; round 4 replaced the implementation again, so read sections 9.4 and 6 for what the
check now is and section 17 for what changed.

| Finding                                                               | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Critical 1** — renamed, default and nested-namespace routes escaped | **FIXED by making rule 1 identity-only.** Section 9.4 no longer filters the port's exports by spelling and no longer enumerates syntax: it resolves the port's exported symbols once, then asks of every identifier and every `import`-type qualifier whether it resolves to one of them and through which files. Module references — namespace imports, namespace exports read as properties, `import … = require(…)`, awaited dynamic imports — are answered by following `export *` graphs recursively under a visited set. All four reported routes now fail, each with `wbs-core:typecheck` exit 0: `routeFor via service/optimizer-trigger-broadcaster.ts`, `pushTo via …`, `routes hands out the contracts from …`, and `Broadcaster via …` for the qualified `import` type (section 6, faults 8 to 11). Every sentence claiming that no spelling can bypass the rule is gone; section 6 and section 9.4 now state exactly what is proven — identity and route — and name the two out-of-scope forms. |
| **Important 2** — fault 11's deletion did not match the listing       | **FIXED by removing the exception.** The identity rule needs no compatibility exception at all, because `export * from` names no symbol: the tree is green with the barrel's wildcard in place and no line permitting it, so there is nothing to delete and no fault 11. Section 9.4 says why in its own words. **Superseded by round 4:** under the module-reference rule a wildcard re-export _is_ a reference, so the permitted-barrel clause came back as a single line with its own negative, section 6's fault 20.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Important 3** — `coreProgram`'s guards had no negatives             | **FIXED.** Both are now faults with observed diagnostics: pointing `configPath` at `tsconfig.absent.json` gives `error: Cannot read file '…/tsconfig.absent.json'.` with `0 pass`, `2 fail`; adding `"module": "invalid"` to the real `tsconfig.lib.json` gives `error: refused tsconfig.lib.json: 6046` with `0 pass`, `2 fail`; and with the `parsed.errors` throw deleted the same malformed option leaves **both assertions passing** on unresolved symbols, `2 pass`, `0 fail` — the false green the guard prevents. Slice 3 authorizes that one mutation outside the permanent edit lane explicitly, prescribes `cp` restoration proved by `cmp`, lists the file as unchanged in the handoff, and names the evidence basenames. The proof-comment count moves from 3 to **5**.                                                                                                                                                                                                                         |
| **Minor 4** — sections 14 and 15 describe code that is gone           | **FIXED.** Both are retitled and carry a note that their descriptions of the implementation are historical and superseded by sections 9.4 and 6, while the findings stay closed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Minor 5** — four factual references                                 | **FIXED, all four verified in the repository.** The collector import is `import.service.ts:7` (line 8 is `DirectoryService`); `SERVICE_ROOTS` is `service-kinds.ts:15-19`; section 9.8 says "four lines"; the file plan's row for the check now names slice 4's JSDoc correction beside the filter change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**New facts this revision measured:** an awaited dynamic import, an `import … = require(…)` and a two-hop
re-export chain are all caught by identity, the last naming both hops; `export type Publisher = Broadcaster`
is **not** caught and is now stated as out of scope, with the reason; `wbs-core:lint` refuses a
`here !== undefined` loop over `ts.Node.parent` and a `??` on an indexed lookup under
`no-unnecessary-condition`; and the identity check costs about 1.6 seconds for the whole file.

**Dispatchable now.** Slices 1 and 2 as written; slices 3, 4 and 5 as their predecessors land.

## 17. Disposition of round 4

| Finding                                                                                                                                                                                                                                                                                                                                                                                                              | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Critical 1** — references with no identifier escaped                                                                                                                                                                                                                                                                                                                                                               | **FIXED by adding two vantage points.** Section 9.4 now resolves **module references** of every form (namespace import, wildcard or namespace re-export, `import … = require(…)`, `import(…)` type, dynamic `import(…)` call, `require(…)` call) and **types** (element access, property access, indexed-access type whose base type is a foreign module object and whose own type resolves to a port symbol), beside the identifier rule. Both reported routes now fail twice over, with `wbs-core:typecheck` exit 0: `'./broadcast' hands out the contracts from service/broadcast.ts` plus `(await import('./broadcast'))['subscriptionFor'] reads a contract out of service/broadcast.ts`, and the same specifier row plus `typeof import('./broadcast')['subscriptionFor'] reads a contract out of service/broadcast.ts`. Section 6 also records the author's further attempts, including a generic `pick` helper over an awaited import and a deep-package import. |
| **Critical 2** — rule 2 exempted a duplicate namespace                                                                                                                                                                                                                                                                                                                                                               | **FIXED.** The declaration pass runs on every node, outside any `else if` chain, and covers namespaces, modules, enums, classes, functions, interfaces, type aliases, variables, binding elements and import or export aliases. Round 4's fault reproduces: `+ "service/step.service.ts: Broadcaster",`, `1 pass`, `1 fail`, typecheck exit 0 (section 6, fault 17).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Important 3** — two guards had no negatives                                                                                                                                                                                                                                                                                                                                                                        | **FIXED.** Both now have faults with observed diagnostics and adjacent comments: emptying the port of exports gives `error: ports/project-event.ts is not a module`, and adding `'ports/missing.ts'` to the scan gives `error: the program holds no ports/missing.ts`, each `0 pass`, `2 fail` (section 6, faults 24 and 25). The count checkpoints move to **8**, split as two comments in slice 3 and six in slice 4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Important 4** — the proof-count block swallowed command errors                                                                                                                                                                                                                                                                                                                                                     | **FIXED by reading the file with Bun instead of `grep`.** The count is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `bun -e '… await Bun.file(Bun.argv[1]).text() …'`, which throws on any I/O failure. Rehearsed four ways: `proof-comments=8`, `proof-comments=0` on a file with none, exit **1** with `ENOENT: no such file or directory, open '…/ports/missing.ts'`, and exit **1** with `EACCES: permission denied, open '…/service/clean-name.ts'` on a file whose mode was temporarily 000. Slices 3, 4 and 5 all use that block. |
| **Important 5** — assumption 6 contradicted the implementation                                                                                                                                                                                                                                                                                                                                                       | **FIXED.** Assumption 6 now states the current behaviour: wildcard re-exports are not themselves checked, their consumers are, and the single permitted module reference is the compatibility barrel, proven by fault 20 (a one-line deletion, as round 4 asked).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Important 6** — the executor was told to copy unproven claims                                                                                                                                                                                                                                                                                                                                                      | **FIXED by prescribing the mutations instead.** The awaited dynamic import and the two-hop chain are now faults 14 and 15 of slice 3, with exact edits in section 9.9, expected diagnostics, restoration and evidence basenames; every claim in the two `Proof:` comments slice 3 writes names a fault slice 3 injects, and the six comments slice 4 writes name faults slice 4 injects.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Minor 7** — stale fault number and diagnostic in the test slice                                                                                                                                                                                                                                                                                                                                                    | **FIXED.** That step is now slice 5 step 4, cites fault **19**, and quotes `Broadcaster via service/broadcast.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Minor 8** — two inaccurate anchors                                                                                                                                                                                                                                                                                                                                                                                 | **FIXED.** The collector is constructed at `import.service.ts:147` on the starting tree, and the configuration guard is identified by its statement — `if (parsed.errors.length > 0) {` — deleted whole, rather than by a line count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**New facts this revision measured:** asking the checker for types costs time — the check runs in about two
seconds and the whole core suite in about thirteen, still far inside the `120_000` timeouts; `bun -e` reads
its arguments from `Bun.argv[1]`, and a `--` separator makes Bun print usage instead (observed); the
permitted-wildcard clause had to come back, because a wildcard re-export **is** a module reference under the
new rule and `index.ts` makes one deliberately; and an `export * as` re-export of a publisher makes the
barrel itself a reporting site, which is why fault 8 and fault 9 each show an `index.ts` row.

**Dispatchable now.** Slices 1 and 2 as written; slices 3 to 6 as their predecessors land.
