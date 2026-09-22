# 040.6 B `broadcast.ts` becomes a neutral event port

> **Dispatch:** `--batch batch-6` (the launcher's batch-6 default supplies
> `--batch-dir docs/superpowers/plans/2026-09-21-batch-6`). No slice binds a port, so **no slice needs
> `--network`**, and **no slice needs `--seed`**: every later slice reads the numbers it needs from the
> committed `verify.md` of `adopt-di-composition`, never from another attempt's evidence directory.
> Section 8 scopes every command the sandbox cannot run.
>
> **Revised on 2026-09-22 after review 1.** The boundary rule now parses syntax trees with the installed
> TypeScript compiler rather than matching text: the review bypassed the regular-expression version four
> ways with zero compiler diagnostics, and each bypass is now a watched negative. Section 14 disposes of
> every finding.
>
> **Rehearsed on `f862a15a`** (main after batch 6's integration, which carries packet A). Every red,
> green, count and fault below was produced in a private worktree of that commit against the listings
> in section 9, one slice at a time, each ending in a real `git commit` that lefthook accepted.

| Field      | Value                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — second packet                                                                                         |
| Size class | M, in five slices                                                                                                                                                                                |
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
check this packet adds — that no file names those three contracts anywhere but the port. The rule reads
syntax trees with the installed TypeScript compiler, because review 1 bypassed a regular-expression
version of it four ways, and each of its assertions carries a watched negative per bypass.

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
| `docs/code-organization/kinds.json` holds **95** entries, and its scan roots are `libs/wbs/application/core/src/service`, `…/src/use-cases` and `apps/wbs/be-01/src/service` only. A new file under `ports/` therefore owes no entry, and no `ports/` file has one today.                                                                                                                                                                                       | `tools/tool-devsync/src/service-kinds.ts:17-21`; `python3 -c` over the policy printed `[]` for `/ports/`                                     |
| Feature-services already import repository ports directly: `plan-commands.ts:9` takes `UnitOfWork`, `import.service.ts:3-6` takes `Clock`, `Scheduler`, `SubtreeCopy` and `UnitOfWork`. A port home for the event contracts adds no new class of K3 debt.                                                                                                                                                                                                       | those lines                                                                                                                                  |
| `import.service.ts:148` builds an `AnnouncementCollector`. Plan import is a feature and Plan commands is a feature, so moving the collector into Plan commands would create the same-kind edge K6 forbids.                                                                                                                                                                                                                                                      | `libs/wbs/application/core/src/service/import.service.ts:8`, `:148`; map "Proposed core modules"                                             |
| `lint:source` exists **only** on the Burokrat project. For `wbs-core` the source-lint target is `lint`.                                                                                                                                                                                                                                                                                                                                                         | `bunx nx show project wbs-core --json`: targets are `build:portable`, `lint`, `lint:fast`, `test`, `test:portable`, `test:unit`, `typecheck` |
| The whole-target values on the rehearsed tree, all exit 0: `wbs-core:test` 543 pass over 54 files, `wbs-be-01:test:unit` 519 pass over 49 files, `wbs-be-01:test` 1091 pass over 92 files, `wbs-gw-01:test` 128 pass over 17 files, `wbs-mcp-01:test` 165 pass over 15 files, `tool-devsync:test` 366 pass, `wbs-core:build:portable`, `wbs-core:test:portable`, `wbs-be-01:typecheck`, `wbs-gw-01:typecheck`, `wbs-mcp-01:typecheck`, `nx format:check --all`. | Observed 2026-09-22                                                                                                                          |
| Strict OpenSpec validation is `{"items": 113, "passed": 113, "failed": 0}` before and after this packet: it opens no change.                                                                                                                                                                                                                                                                                                                                    | The README's `jq -s -e` block, observed exit 0                                                                                               |
| TypeScript **6.0.2** is installed as `npm:@typescript/typescript6@6.0.2`, and a test in this repository already imports it, so the boundary rule can parse instead of matching text.                                                                                                                                                                                                                                                                            | `package.json:117`; `apps/wbs/fe-01/src/deadline-copy.test.ts:4`                                                                             |
| `grep` here is **ugrep** and exits **1** for a missing input file as well as for zero matches, printing only a warning, so a count must gate on `test -f` first.                                                                                                                                                                                                                                                                                                | Observed: `grep -c '^ *// Proof:' <missing path>` exited 1                                                                                   |

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
`import.service.ts:148` — Plan import, a different feature — builds a collector too. Making the collector
private to Plan commands today either creates a feature-to-feature import K6 forbids or forces Plan
import's per-scope factory to change in the same breath. Both belong to the packet that seals Plan
commands. This packet therefore leaves the collector in `service/broadcast.ts`, which
`service-boundaries.test.ts:11` requires to exist anyway, re-points its classification at that fact, and
leaves task 1.2 **unticked** with one note under it naming what landed and where the remainder lives.

**Size.** Five slices of one 20-to-40-minute attempt each: the split is mechanical but wide, so the
work is cut by importer group rather than by file, and the one new check is introduced in the slice whose
red it produces.

## 5. File plan

| Path                                                                | Slice   | Create or modify                                                                                                                      |
| ------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/application/core/src/ports/project-event.ts`              | 1       | create, from section 9.1                                                                                                              |
| `libs/wbs/application/core/src/service/broadcast.ts`                | 1       | modify: keep the collector, re-export the port (section 9.2)                                                                          |
| `libs/wbs/application/core/src/index.ts`                            | 1       | modify, two insertions (section 9.3)                                                                                                  |
| `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts` | 2, 3, 4 | create in slice 2 (section 9.4); slice 3 adds its three `Proof:` comments; slice 4 widens its filter line and corrects one JSDoc line |
| The 17 production importers of section 9.5                          | 2       | modify, one import line each                                                                                                          |
| The 8 test importers of section 9.6                                 | 4       | modify, one import line each                                                                                                          |
| `docs/code-organization/kinds.json`                                 | 5       | modify, one entry rewritten in place (section 9.7)                                                                                    |
| `openspec/changes/adopt-di-composition/tasks.md`                    | 5       | modify, one note under task 1.2 (section 9.8). No box is ticked.                                                                      |
| `openspec/changes/adopt-di-composition/verify.md`                   | 1–5     | modify: each slice appends its own baselines, deltas and evidence basenames                                                           |

**Neighbours.** No other batch-6 packet owns any of these paths. `docs/code-organization/kinds.json` is
also the subject of `tasks.md` 1.8, which stays unticked and untouched here. Section 10's cumulative
check is a `git diff --name-only` against a base each slice records itself, so the planner's own commits
— a revision of this packet file included — cannot break it.

## 6. Rehearsed observations

Every row was produced in a private worktree of `f862a15a` against the final listings in section 9, and
the literal fragment is what Bun 1.4.2 printed. Restore a mutated file from a copy under `"$TMPDIR"` and
prove it with `cmp` **before** asserting on any captured status. Faults 2 to 7 all mutate **production**
files, and `wbs-core:typecheck` exits **0** on every one of them, which is the whole argument for the
rule: the compiler cannot see any of these.

| #   | Where                                                                | Fault injected                                                                                                | Test that observed it                                       | Literal fragment observed                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 2 red, on the tree slice 1 leaves (no importer moved yet)      | none; the rule is new                                                                                         | `is where every importer of the event contracts names them` | `- []` then 22 rows, `+ "compose.ts: Broadcaster from ./service/broadcast",` … `+ "use-cases/save-plan.ts: Broadcaster from ../service/broadcast",`, `- Expected - 1`, `+ Received + 24`; `1 pass`, `1 fail`            |
| 2   | `service/step.service.ts`, its import block                          | the port import replaced by `import type { Broadcaster } from './broadcast';`                                 | `is where every importer of the event contracts names them` | `+ "service/step.service.ts: Broadcaster from ./broadcast",`; `1 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                           |
| 3   | `service/step.service.ts`, its import block and `StepServiceOptions` | `import type * as events from './broadcast';` with `broadcast: events.Broadcaster;` — review 1's first bypass | `is where every importer of the event contracts names them` | `+ "service/step.service.ts: Broadcaster from ./broadcast",`; `1 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                           |
| 4   | `service/capacity.service.ts`, its import block                      | `import type { Broadcaster } from '../index';`, the barrel route                                              | `is where every importer of the event contracts names them` | `+ "service/capacity.service.ts: Broadcaster from ../index",`; `1 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                          |
| 5   | `service/capacity.service.ts`, `CapacityServiceOptions`              | the import deleted and the field written `broadcast: import('./broadcast').Broadcaster;`                      | `is where every importer of the event contracts names them` | `+ "service/capacity.service.ts: Broadcaster from ./broadcast",`; `1 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                       |
| 6   | `service/step.service.ts`, above `StepServiceOptions`                | the import deleted and a local `interface Broadcaster` declared instead (section 9.9)                         | `holds the only declaration of each event contract`         | `+ "service/step.service.ts: Broadcaster",`; `1 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                                            |
| 7   | `service/gateway-broadcaster.ts`, its import block                   | `subscriptionFor` dropped from the import and declared as a local `const` — review 1's second bypass          | `holds the only declaration of each event contract`         | `+ "service/gateway-broadcaster.ts: subscriptionFor",`; `1 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                                 |
| 8   | `ports/event-port-boundaries.test.ts`, the `coreSource` constant     | `new URL('../runtime/', import.meta.url)`                                                                     | both assertions, through `scannedSources`                   | `error: the event-port scan read no ports/project-event.ts under <core>/src/runtime/`; `0 pass`, `2 fail`. With the guard's `throw` **also deleted**, the import assertion passed on the empty scan: `1 pass`, `1 fail` |
| 9   | slice 4 red, after the filter widens to test files                   | none; the rule's scope is what changed                                                                        | `is where every importer of the event contracts names them` | 9 rows, `+ "compose.test.ts: Broadcaster from ./service/broadcast",` … `+ "service/working-plan.test.ts: Broadcaster from ./broadcast",`, `+ Received + 11`; `1 pass`, `1 fail`                                         |
| 10  | `service/working-plan.test.ts`, its import line                      | the port import replaced by `import type { Broadcaster } from './broadcast';`                                 | `is where every importer of the event contracts names them` | `+ "service/working-plan.test.ts: Broadcaster from ./broadcast",`; `1 pass`, `1 fail`                                                                                                                                   |

**Each assertion has mutations that name it, and no mutation hides a second check.** Faults 2, 3, 4, 5
and 10 fail only the import assertion; faults 6 and 7 fail only the declaration assertion; the two live in
two `it` blocks, so one failing does not stop the other running. Fault 8 is the scan guard's own negative,
and its second half — the guard deleted — is what proves the guard is not decoration.

**Also observed, and prescribed because of it.**

- **The first revision's regular-expression scanner was bypassable, and review 1 bypassed it.** A
  namespace import (`import type * as events from './broadcast'` with `events.Broadcaster`) and a second
  `export const subscriptionFor` both passed its two assertions with zero TypeScript diagnostics, and so
  did a barrel import and an `import('./broadcast')` type. Section 9.4 therefore parses instead of
  matching text: TypeScript **6.0.2** is installed (`package.json:117`,
  `npm:@typescript/typescript6@6.0.2`) and a test in this repository already imports it
  (`apps/wbs/fe-01/src/deadline-copy.test.ts:4`), and `wbs-core:typecheck` and `wbs-core:lint` both pass
  on the parser version of the check (observed). Faults 3, 4, 5 and 7 are each of those bypasses, now
  watched. Batch 2's lesson — never hand-write a parser for a standard format — is what this repeats.
- **`grep` here is ugrep, and it exits 1 both for zero matches and for a missing input file** (only a
  warning on standard error), so `grep -c … || test $? -eq 1` cannot tell "none" from "could not read".
  Every count in this packet gates on `test -f` first. Rehearsed three ways on the final check:
  `proof-comments=3`; `proof-comments=0` against a file with none; and `no such file: …` with exit **65**
  against a missing path.
- **A captured status must be branched on, not left to `set -e`.** In a script file
  `set -euo pipefail; count=$(false)` does abort, but inside an inline `bash -c` compound the same lines
  continued with an empty value (observed), so every capture in this packet is either preceded by
  `test -f` or written as `if out=$(…); then … else status=$?; …; fi`.
- Writing each new import where the old one stood leaves `simple-import-sort` unsatisfied;
  `GSETTINGS_BACKEND=memory bunx eslint --fix <files>` moved all twenty-five lines into the positions
  sections 9.5 and 9.6 name, and then exited 0 with nothing further to fix.
- Declaring the duplicate `Broadcaster` inside `service/broadcast.ts` is additionally refused by the type
  checker — `index.ts` `TS2308: Module './ports/project-event' has already exported a member named
'Broadcaster'` and `broadcast.ts` `TS2440: Import declaration conflicts with local declaration of
'Broadcaster'` — which is why fault 6 declares it in a publisher the barrel does not re-export the name
  from, where the compiler stays silent.

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
test ! -f libs/wbs/application/core/src/ports/project-event.ts && echo "gate: nothing to overwrite"
wc -l < libs/wbs/application/core/src/service/broadcast.ts
grep -c "^export" libs/wbs/application/core/src/service/broadcast.ts
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
grep -c "^export function subscriptionFor" libs/wbs/application/core/src/ports/project-event.ts
grep -c "ports/project-event" libs/wbs/application/core/src/service/broadcast.ts
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

### Slice 3 — Watch each assertion fail

**Step 0.** The count gate is written this way because `grep` here is ugrep, which exits 1 for a missing
file as well as for zero matches; `test -f` is what separates them (rehearsed three ways, section 6).

```sh
base=$(git rev-parse HEAD)
check=libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
test -f "$check" || { echo "no such file: $check" >&2; exit 65; }
if count=$(grep -c '^ *// Proof:' "$check"); then
  echo "proof-comments=$count"
else
  status=$?
  test "$status" -eq 1
  echo "proof-comments=0"
fi
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
```

Expect `proof-comments=0` and exit 0, then exit 0, then `2 pass`, `0 fail` (observed). Record this
slice's `C` and `F` the way slice 2 does — observed `543` over 54 — and require them unchanged at the
end: this slice adds no test.

Inject section 6's faults 2 to 8 **one at a time**, each saved as a patch under `"$TMPDIR/evidence"` with
the README's `if diff …; then …; else test $? -eq 1; fi` form, each restored with `cp` and proved with
`cmp` before the next and before asserting on any captured status. Section 9.9 gives the four listings
the faults insert.

| Fault          | Exact location and edit                                                                                                                                                                                     | Expected result                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 2              | `service/step.service.ts`: delete `import type { Broadcaster } from '../ports/project-event';`, add `import type { Broadcaster } from './broadcast';` directly below the `'./assumed-assignee'` import      | exit 1, `+ "service/step.service.ts: Broadcaster from ./broadcast",`, `1 pass`, `1 fail`; `wbs-core:typecheck` exit 0 |
| 3              | `service/step.service.ts`: that same import line becomes `import type * as events from './broadcast';`, and `StepServiceOptions`' single `broadcast: Broadcaster;` becomes `broadcast: events.Broadcaster;` | exit 1, the same row as fault 2, `1 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                      |
| 4              | `service/capacity.service.ts`: that file's one port import becomes `import type { Broadcaster } from '../index';`                                                                                           | exit 1, `+ "service/capacity.service.ts: Broadcaster from ../index",`, `1 pass`, `1 fail`; typecheck exit 0           |
| 5              | `service/capacity.service.ts`: delete that import and write `CapacityServiceOptions`' single `broadcast: Broadcaster;` as `broadcast: import('./broadcast').Broadcaster;`                                   | exit 1, `+ "service/capacity.service.ts: Broadcaster from ./broadcast",`, `1 pass`, `1 fail`; typecheck exit 0        |
| 6              | `service/step.service.ts`: delete that import and declare section 9.9's local `interface Broadcaster` directly above `export interface StepServiceOptions {`                                                | exit 1, `+ "service/step.service.ts: Broadcaster",`, `1 pass`, `1 fail`; typecheck exit 0                             |
| 7              | `service/gateway-broadcaster.ts`: its one import becomes `import type { Broadcaster, ProjectEvent } from '../ports/project-event';` followed by section 9.9's local `const subscriptionFor`                 | exit 1, `+ "service/gateway-broadcaster.ts: subscriptionFor",`, `1 pass`, `1 fail`; typecheck exit 0                  |
| 8              | `ports/event-port-boundaries.test.ts`: `const coreSource = fileURLToPath(new URL('../runtime/', import.meta.url));`                                                                                         | exit 1, `error: the event-port scan read no ports/project-event.ts under …/src/runtime/`, `0 pass`, `2 fail`          |
| 8, second half | that same wrong root **and** the five-line `for (const required …)` guard deleted                                                                                                                           | exit 1, but the import assertion **passes** on the empty scan: `1 pass`, `1 fail`. Restore both edits together        |

Fault 8 mutates the check's own file, which is what an architecture rule's negative fixture is: the guard
has no other production path. Faults 2 to 7 are production files, and the type check passes on all six.

Then add the three dated `Proof:` comments of section 9.4 — one above each assertion and one above the
guard — and append to `verify.md` the seven faults with the literal fragments observed and their evidence
basenames (`step-named-import.patch` and `.log`, `step-namespace.*`, `capacity-barrel.*`,
`capacity-import-type.*`, `step-local-interface.*`, `gateway-local-const.*`, `scan-root.*`,
`scan-root-guard-deleted.*`, and one `…-restored-green.log` per restore). Only after those edits:

| Command                                                                          | Expect                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts`   | exit 0, `2 pass`, `0 fail`                                          |
| the step-0 count block, rerun                                                    | `proof-comments=3`, exit 0 (observed)                               |
| `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache` | exit 0                                                              |
| `(cd libs/wbs/application/core && bun test src)`                                 | exit 0, `C` passes over `F` files, unchanged (observed 543 over 54) |
| `GSETTINGS_BACKEND=memory bunx nx format:check --all`                            | exit 0                                                              |

Planner commit: `test(core): record the project-event port's watched negatives`.

### Slice 4 — The rule covers the tests too

**Step 0.** The same count gate as slice 3, plus the filter this slice widens.

```sh
base=$(git rev-parse HEAD)
check=libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
test -f "$check" || { echo "no such file: $check" >&2; exit 65; }
if count=$(grep -c '^ *// Proof:' "$check"); then
  echo "proof-comments=$count"
else
  status=$?
  test "$status" -eq 1
  echo "proof-comments=0"
fi
grep -cF -- ".filter((path) => path.endsWith('.ts') && !path.includes('.test.'))" "$check"
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
```

Expect `proof-comments=3`, then **1**, then exit 0 (observed). Record `C` and `F` again — observed `543`
over 54 — and require them unchanged: this slice adds no test file.

1. Change that one filter line to `.filter((path) => path.endsWith('.ts'))` and run the check. Expect the
   red of section 6 fault 9: exit 1, the 9 rows naming eight test files, `1 pass`, `1 fail`.
2. Apply section 9.6's eight one-line edits, then
   `GSETTINGS_BACKEND=memory bunx eslint --fix` on those eight paths → exit 0.
3. `bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts` → exit 0, `2 pass`,
   `0 fail` (observed).
4. Inject section 6 fault 10 — in `service/working-plan.test.ts` replace
   `import type { Broadcaster } from '../ports/project-event';` with
   `import type { Broadcaster } from './broadcast';` — and expect exit 1 with
   `+ "service/working-plan.test.ts: Broadcaster from ./broadcast",`, `1 pass`, `1 fail` (observed). Save
   the patch as `working-plan-test-import.patch` with its `.log`, restore with `cp`, prove with `cmp`,
   rerun green into `working-plan-test-import-restored-green.log`.
5. Change the helper's JSDoc first line from `Every production file of the core, as a path under \`src\`.`to`Every TypeScript file of the core, as a path under \`src\`.`, which is the wording section 9.4
shows; the three `Proof:` comments are already final and are not touched, so the count stays **3**.
6. `(cd libs/wbs/application/core && bun test src)` → exit 0 with `C` over `F` (observed `543 pass`,
   `0 fail`, 54 files); `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache`
   → exit 0; append the baselines, the red's 9 rows, the fault and the basenames to `verify.md`; then
   `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `refactor(core): name the port in every core test that publishes`.

### Slice 5 — Classification, the task note, and the close

**Step 0.** Both baselines this slice compares against are collected here: the classification count and
the OpenSpec item total. The task-note lookup needs `-F --`, because the pattern starts with `-`; without
`--` the reviewed tree printed `grep: invalid option -- ' '` and exited **2** (observed).

```sh
base=$(git rev-parse HEAD)
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
python3 -c "import json,sys; e=[x for x in json.load(open('docs/code-organization/kinds.json'))['entries'] if x['path']=='libs/wbs/application/core/src/service/broadcast.ts']; sys.exit(0 if len(e)==1 else 1)" \
  && echo "gate: one broadcast row"
grep -cF -- '- [ ] 1.2 Split `broadcast.ts`:' openspec/changes/adopt-di-composition/tasks.md
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
```

Expect a number, the gate line, **1**, then exit 0 (all observed). Call the first number `K`. Then run the
README's strict OpenSpec validation block **before editing anything** and record
`jq -r '.summary.totals' "$report"` as `N` items, `N` passed, 0 failed; it was `113`/`113`/`0` on the
rehearsed tree, which is evidence and not the requirement. The end of this slice requires `K` and `N`
unchanged, because it opens no change and adds no classified file.

1. Rewrite the `service/broadcast.ts` entry **in place** as section 9.7 shows: same `path`, same `kind`,
   new `disposition` and `rationale`. **Add no entry** for `ports/project-event.ts` or
   `ports/event-port-boundaries.test.ts`: `service-kinds.ts:17-21` scans only
   `libs/wbs/application/core/src/service`, `…/src/use-cases` and `apps/wbs/be-01/src/service`, and a row
   for an unscanned path fails `every backend service file with no kind suffix is classified exactly once`.
2. Add the note of section 9.8 under task 1.2 in `openspec/changes/adopt-di-composition/tasks.md`.
   **Tick no box:** 1.2's second half, the collector's move into Plan commands, is not done and section 4
   says why.
3. Append to `verify.md`: `K` and `N` with their closing values, the port-and-adapter decision with its
   map citations, this slice's evidence basenames (`slice-5-kinds-baseline.txt`,
   `slice-5-kinds-final.txt`, the validation report's own basename), and these two findings by name, so
   later packets do not inherit them silently: **the collector's move waits for task 5.2** because
   `import.service.ts:148` builds one too, and **`ports/project-event.ts` keeps a type-only import of
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

The rule reads each file's **syntax tree** with the installed TypeScript compiler, not with regular
expressions: review 1 bypassed a regular-expression version with a namespace import and with a second
`export const subscriptionFor`, both compiling clean, and batch 2's lesson about hand-written parsers is
the same lesson. It stays local to this test; `apps/wiki/cli/src/relationships/typescript.ts` is not
touched, imported or moved.

The permitted forms are exactly two, and everything else about those three names is reported:

- an `import`, a named re-export or an `import(…)` type whose module resolves to `ports/project-event`;
- the port's own three declarations.

So a named import or re-export from any other module, from `'../index'` or from `'@wbs/core'`, a namespace
import used as `events.Broadcaster` in a value or a type position, an `import('./broadcast')` type, a
module specifier that is not a string literal, and any interface, type alias, class, function, enum or
variable that declares one of the names again are all reported. No value is defaulted: the two optional
reads in the walk are TypeScript's own optional syntax — an import clause may have no named bindings, a
re-export may have no module — and each is handled as the case it is.

Slice 2 creates it exactly as below **except** that its `.filter` line reads
`.filter((path) => path.endsWith('.ts') && !path.includes('.test.'))`, its helper JSDoc says
`Every production file of the core`, and the three `Proof:` comments are absent. Slice 3 adds those
comments; slice 4 widens the filter and corrects that JSDoc line. The text below is the finished file, 198
lines, Prettier-clean, and it passes `wbs-core:typecheck` and `wbs-core:lint` (observed).

```ts
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
import ts from 'typescript';

const coreSource = fileURLToPath(new URL('..', import.meta.url));
const portHome = 'ports/project-event.ts';
const collectorHome = 'service/broadcast.ts';
const eventNames = ['Broadcaster', 'ProjectEvent', 'subscriptionFor'] as const;

function isEventName(name: string): boolean {
  return (eventNames as readonly string[]).includes(name);
}

/**
 * The module a specifier names, as a path under `src`, or the specifier itself
 * when it leaves the core.
 *
 * A package name is returned unresolved on purpose: `@wbs/core` re-exports the
 * event contracts through its barrel, so a core file that reaches them that way
 * has to be reported rather than silently accepted.
 */
function moduleUnderSrc(fromPath: string, specifier: string): string {
  if (!specifier.startsWith('.')) return specifier;
  return `${resolve(dirname(`${coreSource}${fromPath}`), specifier).slice(coreSource.length)}.ts`;
}

/**
 * What one file says about the three event contracts, read from its syntax tree.
 *
 * The permitted forms are exactly two: an import, re-export or `import(…)` type
 * whose module is `ports/project-event`, and the port's own declarations. Every
 * other way of naming one of them is reported — a named import or re-export from
 * another module or from the `@wbs/core` barrel, a namespace import used as
 * `events.Broadcaster` in a value or a type position, an `import('./broadcast')`
 * type, and any interface, type alias, class, function, enum or variable that
 * declares the name again. A regular-expression scanner saw only the first of
 * those: a reviewer bypassed it with a namespace import and with a second
 * `export const subscriptionFor`, both compiling with zero diagnostics.
 *
 * A module specifier that is not a string literal cannot occur in a file the type
 * check accepts; it is reported rather than skipped, so a malformed tree fails the
 * rule instead of passing it.
 */
function contractUsesIn(path: string, source: string): { named: string[]; declared: string[] } {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const named: string[] = [];
  const declared: string[] = [];
  const namespaceAlias = new Map<string, string>();

  function note(name: string, specifier: string): void {
    if (moduleUnderSrc(path, specifier) !== portHome) {
      named.push(`${path}: ${name} from ${specifier}`);
    }
  }

  function declares(node: ts.Node): ts.Identifier | undefined {
    if (
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isVariableDeclaration(node)
    ) {
      const name = node.name;
      return name !== undefined && ts.isIdentifier(name) ? name : undefined;
    }
    return undefined;
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) {
        named.push(`${path}: an import whose module is not a string literal`);
      } else {
        const specifier = node.moduleSpecifier.text;
        const bindings = node.importClause?.namedBindings;
        if (bindings !== undefined && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const name = (element.propertyName ?? element.name).text;
            if (isEventName(name)) note(name, specifier);
          }
        }
        if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
          namespaceAlias.set(bindings.name.text, specifier);
        }
      }
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) {
        named.push(`${path}: a re-export whose module is not a string literal`);
      } else {
        const specifier = node.moduleSpecifier.text;
        const clause = node.exportClause;
        if (clause !== undefined && ts.isNamedExports(clause)) {
          for (const element of clause.elements) {
            const name = (element.propertyName ?? element.name).text;
            if (isEventName(name)) note(name, specifier);
          }
        }
      }
    }
    if (ts.isImportTypeNode(node)) {
      const qualifier = node.qualifier;
      if (
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal) &&
        qualifier !== undefined &&
        ts.isIdentifier(qualifier) &&
        isEventName(qualifier.text)
      ) {
        note(qualifier.text, node.argument.literal.text);
      }
    }
    if (ts.isQualifiedName(node) && ts.isIdentifier(node.left) && isEventName(node.right.text)) {
      const specifier = namespaceAlias.get(node.left.text);
      if (specifier !== undefined) note(node.right.text, specifier);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      isEventName(node.name.text)
    ) {
      const specifier = namespaceAlias.get(node.expression.text);
      if (specifier !== undefined) note(node.name.text, specifier);
    }
    const declaredName = declares(node);
    if (declaredName !== undefined && isEventName(declaredName.text)) {
      declared.push(`${path}: ${declaredName.text}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { named, declared };
}

/**
 * Every TypeScript file of the core, as a path under `src`.
 *
 * Throws when the port or the collector is missing from what it read, because a
 * scan that found neither would report an empty violation list and pass.
 */
async function scannedSources(): Promise<readonly string[]> {
  const found = (await readdir(coreSource, { recursive: true }))
    .filter((path) => path.endsWith('.ts'))
    .map((path) => path.replaceAll('\\', '/'))
    .sort();
  // Proof: pointing `coreSource` at `src/runtime/` threw `the event-port scan read no
  // ports/project-event.ts under …/src/runtime/` and failed both tests, 0 pass and 2 fail; with this
  // throw deleted the same wrong root left the import test passing on an empty scan, 1 pass and 1
  // fail (2026-09-22).
  for (const required of [portHome, collectorHome]) {
    if (!found.includes(required)) {
      throw new Error(`the event-port scan read no ${required} under ${coreSource}`);
    }
  }
  return found;
}

async function contractUses(): Promise<{ named: string[]; declared: string[] }> {
  const named: string[] = [];
  const declared: string[] = [];
  for (const path of await scannedSources()) {
    const uses = contractUsesIn(path, await readFile(`${coreSource}${path}`, 'utf8'));
    named.push(...uses.named);
    declared.push(...uses.declared);
  }
  return { named: named.sort(), declared: declared.sort() };
}

describe('the neutral project-event port', () => {
  it('is where every importer of the event contracts names them', async () => {
    // Proof: in service/step.service.ts, `import type { Broadcaster } from './broadcast';` and
    // `import type * as events from './broadcast';` with `events.Broadcaster` each failed here with
    // `+ "service/step.service.ts: Broadcaster from ./broadcast"`; in service/capacity.service.ts,
    // importing `Broadcaster` from `'../index'` failed with `from ../index` and writing
    // `import('./broadcast').Broadcaster` failed with `from ./broadcast`. `wbs-core:typecheck` exited
    // 0 on all four, and the regular-expression scanner this replaced saw only the first (2026-09-22).
    expect((await contractUses()).named).toEqual([]);
  });

  it('holds the only declaration of each event contract', async () => {
    // Proof: declaring `interface Broadcaster` in service/step.service.ts instead of importing it
    // failed here with `+ "service/step.service.ts: Broadcaster"`, and a local
    // `const subscriptionFor` in service/gateway-broadcaster.ts failed with
    // `+ "service/gateway-broadcaster.ts: subscriptionFor"`; `wbs-core:typecheck` exited 0 on both,
    // because a structurally identical declaration is interchangeable (2026-09-22).
    expect((await contractUses()).declared).toEqual([
      `${portHome}: Broadcaster`,
      `${portHome}: ProjectEvent`,
      `${portHome}: subscriptionFor`,
    ]);
  });
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

Add these three lines directly under task 1.2 in
`openspec/changes/adopt-di-composition/tasks.md`, at the same indentation its continuation lines use, and
leave the checkbox unticked:

```md
      Port landed 2026-09-22 as `libs/wbs/application/core/src/ports/project-event.ts`, with
      `ports/event-port-boundaries.test.ts` as its checked rule. The collector stays in
      `service/broadcast.ts` and moves with 5.2: `import.service.ts:148` builds one too, so Plan
      commands cannot own it privately before that module exists without a K6 feature-to-feature edge.
```

### 9.9 The four listings slice 3 injects

Only as faults, never as prescriptions. Fault 3, the namespace bypass, in `service/step.service.ts`:

```ts
import type * as events from './broadcast';
```

with that file's single `broadcast: Broadcaster;` field becoming `broadcast: events.Broadcaster;`. Fault
5, the import-type bypass, is `service/capacity.service.ts`' single `broadcast: Broadcaster;` field
becoming:

```ts
broadcast: import('./broadcast').Broadcaster;
```

Fault 6, the second declaration, goes directly above `export interface StepServiceOptions {` in
`service/step.service.ts` once that file's port import is deleted:

```ts
interface Broadcaster {
  publish(projectId: string, event: unknown): Promise<void>;
  latestSeq(projectId: string): Promise<number>;
}
```

Fault 7, the second `subscriptionFor`, replaces `service/gateway-broadcaster.ts`' one import line with an
import that drops that name plus a local declaration of it:

```ts
import type { Broadcaster, ProjectEvent } from '../ports/project-event';

const subscriptionFor = (projectId: string): string => `project:${projectId}`;
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
| 4     | the eight files of section 9.6, `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts`, `openspec/changes/adopt-di-composition/verify.md` | nothing                                                             |
| 5     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`               | nothing                                                             |

Twenty-nine files under `libs/wbs/application/core/src` — 17 production importers, 8 test importers,
`broadcast.ts`, `index.ts`, the port and its check — plus `docs/code-organization/kinds.json`,
`openspec/changes/adopt-di-composition/tasks.md` and `…/verify.md`: **32 paths**, every one of them
rehearsed, including the task note. Measured with the five slices applied in order and staged:
`git diff --cached --name-only | wc -l` printed **32** (observed 2026-09-22). Subjects are the five named in section 7. Never `--no-verify`.

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
6. **No `tsconfig.json` and no isolated type-check target.** `tasks.md` 7.3 carries that work with its own
   proof, and adding an Nx target would move `tools/tool-devsync/src/workspace-inventory.test.ts` counts.

## 13. Corrections this packet makes, and what it found wrong

| Where                                                                 | Finding                                                                                                                                                                                                                                                     | Disposition                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `docs/code-organization/kinds.json`, the `service/broadcast.ts` row   | Its disposition said "move to the realtime module", which contradicts the map twice: preparation 1 sends the contracts to a neutral port and the Realtime row says Realtime "does not own the event union or Plan commands' collector"                      | Rewritten in place by slice 5 (section 9.7)                                    |
| `libs/wbs/application/core/src/service/broadcast.ts:196-198`          | `subscriptionFor`'s JSDoc says gw-01 "matches sockets against it". gw-01 imports nothing from `@wbs/core` and parses the prefix with its own `PROJECT_SUBSCRIPTION` at `apps/wbs/gw-01/src/controller/ws.controller.ts:68`                                  | Corrected by slice 1 as part of the move (section 9.1, edit one)               |
| Map, required preparation 1                                           | It sends `AnnouncementCollector` into Plan commands "as batch-private support" without noticing `import.service.ts:148`, a **second feature**, which builds one; doing that before Plan commands exists would create the K6 edge the same map forbids       | Deferred to `tasks.md` 5.2 with the note of section 9.8; the map should say so |
| Map, "Portable core: 50/50" and preparation 1                         | Both call the split one item, but the two halves have different owners and different earliest dates. Measured: the port half touches 25 importers and lands now; the collector half cannot land before Plan commands                                        | Recorded here; a later map revision should split the line                      |
| Packet A's code, `libs/wbs/application/core/src/module/plan-history/` | Nothing wrong found. Its five files, the shim at `service/history.service.ts`, the `compose.ts` installation and the `index.ts` compatibility exports are as its section 10 prescribes, and `wbs-core:test` is green at `543 pass` with this packet applied | No action                                                                      |

## 14. Disposition of review 1

| Finding                                                  | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical 1** — the `Proof:` counts are wrong           | **FIXED.** The listing's introductory comment is gone with the regular expressions, and the count now matches only lines beginning `// Proof:`, behind a `test -f` gate because ugrep exits 1 for a missing file too. Rehearsed three ways: `proof-comments=3` on the finished check, `proof-comments=0` on a file with none, exit **65** on a missing path. Slices 3 and 4 both use that block, and slice 3's step 0 expects `proof-comments=0`.                                                                                                                                                                                                                                                                             |
| **Critical 2** — slice 5's step-0 lookup is invalid      | **FIXED.** Reproduced: without `--` the pattern's leading `-` gave `grep: invalid option -- ' '` and exit 2. Slice 5 now runs `grep -cF -- '- [ ] 1.2 Split \`broadcast.ts\`:' openspec/changes/adopt-di-composition/tasks.md`, which printed **1** at exit 0 (observed), and the step says why `--` is needed.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Critical 3** — the boundary rule had false greens      | **FIXED by rewriting the prescribed code.** Section 9.4 now parses each file with the installed TypeScript 6.0.2 (`ts.createSourceFile`, then a walk over `ImportDeclaration`, `ExportDeclaration`, `ImportTypeNode`, `QualifiedName` and `PropertyAccessExpression` against recorded namespace aliases, plus interface, type, class, function, enum and variable declarations), states its permitted forms, and resolves every specifier against the port. All four of the reviewer's escapes are now watched negatives — faults 3, 4, 5 and 7 of section 6 — each rehearsed with `wbs-core:typecheck` exit 0 beside it. The check stays inside the test file; `apps/wiki/cli/src/relationships/typescript.ts` is untouched. |
| **Important 4** — missing captures became success        | **FIXED.** The `?? ''` and the ignored declaration name are gone with the regular expressions. The parser walk defaults no value: a clause without named bindings and a re-export without a module are TypeScript's own optional syntax and are handled as those cases, and a module specifier that is not a string literal is **reported into the assertion** rather than skipped, so a malformed tree fails the rule.                                                                                                                                                                                                                                                                                                       |
| **Important 5** — the production negative used a fixture | **FIXED.** The duplicate-declaration negatives are now `service/step.service.ts` declaring a local `interface Broadcaster` (fault 6) and `service/gateway-broadcaster.ts` declaring a local `const subscriptionFor` (fault 7) — both publishers, both with `wbs-core:typecheck` exit 0. No fault in section 6 touches `testing/broadcast-fixture.ts` any more, and section 6's opening sentence now states truthfully that faults 2 to 7 are production files.                                                                                                                                                                                                                                                                |
| **Important 6** — no local OpenSpec baseline             | **FIXED.** Slice 5's step 0 runs the strict validation block **before** editing and records `N` items, `N` passed, 0 failed beside `K`; the closing table requires the step-0 `N`, with `113`/`113`/`0` kept only as observed evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Important 7** — the required evidence was undefined    | **FIXED.** Slice 5 step 3 names the two findings to record — the collector's move waiting for task 5.2 because `import.service.ts:148` builds one too, and the port's type-only `../service/numbered-work-item` edge pending `tasks.md` 6.1 — and names its evidence basenames. Slices 3 and 4 name theirs too.                                                                                                                                                                                                                                                                                                                                                                                                               |
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
