# 040.6 B `broadcast.ts` becomes a neutral event port

> **Dispatch:** `--batch batch-6` (the launcher's batch-6 default supplies
> `--batch-dir docs/superpowers/plans/2026-09-21-batch-6`). No slice binds a port, so **no slice needs
> `--network`**, and **no slice needs `--seed`**: every later slice reads the numbers it needs from the
> committed `verify.md` of `adopt-di-composition`, never from another attempt's evidence directory.
> Section 8 scopes every command the sandbox cannot run.
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
check this packet adds — that no file names those three contracts anywhere but the port, with a
watched negative for each of its assertions.

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

| Path                                                                | Slice   | Create or modify                                                                                                        |
| ------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/application/core/src/ports/project-event.ts`              | 1       | create, from section 9.1                                                                                                |
| `libs/wbs/application/core/src/service/broadcast.ts`                | 1       | modify: keep the collector, re-export the port (section 9.2)                                                            |
| `libs/wbs/application/core/src/index.ts`                            | 1       | modify, two insertions (section 9.3)                                                                                    |
| `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts` | 2, 3, 4 | create in slice 2 (section 9.4); slice 3 adds three `Proof:` comments; slice 4 changes one line and extends one comment |
| The 17 production importers of section 9.5                          | 2       | modify, one import line each                                                                                            |
| The 8 test importers of section 9.6                                 | 4       | modify, one import line each                                                                                            |
| `docs/code-organization/kinds.json`                                 | 5       | modify, one entry rewritten in place (section 9.7)                                                                      |
| `openspec/changes/adopt-di-composition/tasks.md`                    | 5       | modify, one note under task 1.2 (section 9.8). No box is ticked.                                                        |
| `openspec/changes/adopt-di-composition/verify.md`                   | 1–5     | modify: each slice appends its own baselines, deltas and evidence basenames                                             |

**Neighbours.** No other batch-6 packet owns any of these paths. `docs/code-organization/kinds.json` is
also the subject of `tasks.md` 1.8, which stays unticked and untouched here. Section 10's cumulative
check is a `git diff --name-only` against a base each slice records itself, so the planner's own commits
— a revision of this packet file included — cannot break it.

## 6. Rehearsed observations

Every row was produced in a private worktree of `f862a15a` against the final listings in section 9, and
the literal fragment is what Bun 1.4.2 printed. Restore a mutated file from a copy under `"$TMPDIR"` and
prove it with `cmp` **before** asserting on any captured status.

| #   | Where                                                                               | Fault injected                                                                                           | Test that observed it                                       | Literal fragment observed                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 2 red, on the tree slice 1 leaves (no importer moved yet)                     | none; the rule is new                                                                                    | `is where every importer of the event contracts names them` | `- []` then 22 added rows, `+ "compose.ts: Broadcaster",` … `+ "use-cases/save-plan.ts: Broadcaster",`, `- Expected - 1`, `+ Received + 24`; `1 pass`, `1 fail`                                                                             |
| 2   | `libs/wbs/application/core/src/service/step.service.ts`, its import block           | the `'../ports/project-event'` import replaced by `import type { Broadcaster } from './broadcast';`      | `is where every importer of the event contracts names them` | `+ "service/step.service.ts: Broadcaster",`, `- Expected - 1`, `+ Received + 3`; `1 pass`, `1 fail`. **`wbs-core:typecheck` exits 0 on this mutation**, which is why the check exists                                                       |
| 3   | `libs/wbs/application/core/src/testing/broadcast-fixture.ts`, its first declaration | a second `export interface Broadcaster` declared locally and extended, instead of imported from the port | `holds the only declaration of each event contract`         | `+ "testing/broadcast-fixture.ts: Broadcaster",`, `- Expected - 0`, `+ Received + 1`; `1 pass`, `1 fail`. **`wbs-core:typecheck` exits 0** on it too, because two identical interfaces are structurally interchangeable                     |
| 4   | `event-port-boundaries.test.ts`, the `coreSource` constant                          | `new URL('../runtime/', import.meta.url)` in place of `new URL('..', import.meta.url)`                   | both assertions, through `scannedSources`                   | `error: the event-port scan read no ports/project-event.ts under <core>/src/runtime/`; `0 pass`, `2 fail`. With the guard's `throw` **deleted** and the same wrong root, the sideways assertion passed on an empty scan: `1 pass`, `1 fail` |
| 5   | slice 4 red, after the filter widens to test files                                  | none; the rule's scope is what changed                                                                   | `is where every importer of the event contracts names them` | 9 added rows, `+ "compose.test.ts: Broadcaster",` … `+ "service/working-plan.test.ts: Broadcaster",`, `- Expected - 1`, `+ Received + 11`; `1 pass`, `1 fail`                                                                               |
| 6   | `libs/wbs/application/core/src/service/working-plan.test.ts`, its import line       | the `'../ports/project-event'` import replaced by `import type { Broadcaster } from './broadcast';`      | `is where every importer of the event contracts names them` | `+ "service/working-plan.test.ts: Broadcaster",`; `1 pass`, `1 fail`. This is what widening the scan in slice 4 buys                                                                                                                        |

**Each assertion has a mutation that names it, and no mutation hides a second check.** Row 2 and row 6
fail only the sideways assertion, row 3 only the declaration assertion; the two assertions live in two
`it` blocks, so one failing does not stop the other running. Row 4 is the scan guard's own negative, and
its second half — the guard deleted — is what proves the guard is not decoration.

**Also observed, and prescribed because of it.**

- Both regular expressions must be anchored at the start of a line with the `m` flag. Unanchored, once
  slice 4 widens the scan to test files, the check reported `ports/event-port-boundaries.test.ts` for
  **both** rules, because the file's own pattern literal and its `Proof:` comments quote the very text
  they look for.
- Writing each new import where the old one stood leaves `simple-import-sort` unsatisfied;
  `GSETTINGS_BACKEND=memory bunx eslint --fix <files>` moved all twenty-five lines into the positions
  section 9.5 and 9.6 name, and then exited 0 with nothing further to fix.
- Declaring the duplicate `Broadcaster` inside `service/broadcast.ts` rather than in the fixture is
  additionally refused by the type checker — `index.ts` `TS2308: Module './ports/project-event' has
already exported a member named 'Broadcaster'` and `broadcast.ts` `TS2440: Import declaration conflicts
with local declaration of 'Broadcaster'` — so the fixture is the location that proves the check rather
  than the compiler.

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
   section 6 row 1: exit 1, the 22 rows, `1 pass`, `1 fail`. A run reporting `0 tests ran` or a green run
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

**Step 0.**

```sh
base=$(git rev-parse HEAD)
test -f libs/wbs/application/core/src/ports/event-port-boundaries.test.ts && echo "gate: slice 2 landed"
grep -c "Proof:" libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
```

Expect the gate line, **0**, exit 0, then `2 pass`, `0 fail`.

Inject section 6's rows 2, 3 and 4 **one at a time**, each saved as a patch under `"$TMPDIR/evidence"`
with the README's `if diff …; then …; else test $? -eq 1; fi` form, each restored with `cp` and proved
with `cmp` before the next and before asserting on any captured status.

| Fault              | Exact location                                                                                                                                                                                                      | Expected result                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Row 2              | `service/step.service.ts`: delete `import type { Broadcaster } from '../ports/project-event';` and add `import type { Broadcaster } from './broadcast';` directly below the `'./assumed-assignee'` import           | exit 1, `+ "service/step.service.ts: Broadcaster",`, `1 pass`, `1 fail`; then `wbs-core:typecheck` exit **0** with the fault in place |
| Row 3              | `testing/broadcast-fixture.ts`: narrow line 1 to `import type { ProjectEvent } from '../ports/project-event';` and declare the four-line `export interface Broadcaster` of section 9.9 above `RecordingBroadcaster` | exit 1, `+ "testing/broadcast-fixture.ts: Broadcaster",`, `1 pass`, `1 fail`; then `wbs-core:typecheck` exit **0**                    |
| Row 4              | `ports/event-port-boundaries.test.ts`: `const coreSource = fileURLToPath(new URL('../runtime/', import.meta.url));`                                                                                                 | exit 1, `error: the event-port scan read no ports/project-event.ts under …/src/runtime/`, `0 pass`, `2 fail`                          |
| Row 4, second half | the same wrong root **and** the five-line `for (const required …)` guard deleted                                                                                                                                    | exit 1, but the sideways assertion **passes** on the empty scan: `1 pass`, `1 fail`. Restore both edits together                      |

Both halves of row 4 mutate the check's own file, which is what an architecture-level rule's negative
fixture is: the rule has no other production path. Rows 2 and 3 are production files, and the type check
passes on both, which is the whole argument for the rule.

Then add the three dated `Proof:` comments of section 9.4 — one above each assertion and one above the
guard — and append to `verify.md` the three faults with the literal fragments observed and the evidence
basenames. Only after those edits:

| Command                                                                              | Expect                     |
| ------------------------------------------------------------------------------------ | -------------------------- |
| `bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts`       | exit 0, `2 pass`, `0 fail` |
| `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache`     | exit 0                     |
| `GSETTINGS_BACKEND=memory bunx nx format:check --all`                                | exit 0                     |
| `grep -c "Proof:" libs/wbs/application/core/src/ports/event-port-boundaries.test.ts` | **3**                      |

Planner commit: `test(core): record the project-event port's watched negatives`.

### Slice 4 — The rule covers the tests too

**Step 0.**

```sh
base=$(git rev-parse HEAD)
grep -c "Proof:" libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
grep -cF ".filter((path) => path.endsWith('.ts') && !path.includes('.test.'))" \
  libs/wbs/application/core/src/ports/event-port-boundaries.test.ts
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
```

Expect **3**, **1**, then exit 0. Record `C` and `F` again; observed `543` over 54. This slice adds no
test file and must end at `C` and `F` unchanged.

1. Change that one filter line to `.filter((path) => path.endsWith('.ts'))` and run the check. Expect the
   red of section 6 row 5: exit 1, the 9 rows naming eight test files, `1 pass`, `1 fail`.
2. Apply section 9.6's eight one-line edits, then
   `GSETTINGS_BACKEND=memory bunx eslint --fix` on those eight paths → exit 0.
3. `bun test ./libs/wbs/application/core/src/ports/event-port-boundaries.test.ts` → exit 0, `2 pass`,
   `0 fail`.
4. Inject section 6 row 6 — in `service/working-plan.test.ts` replace
   `import type { Broadcaster } from '../ports/project-event';` with
   `import type { Broadcaster } from './broadcast';` — and expect exit 1 with
   `+ "service/working-plan.test.ts: Broadcaster",`, `1 pass`, `1 fail`. Save the patch, restore with
   `cp`, prove with `cmp`, rerun green.
5. Extend the sideways assertion's `Proof:` comment to the final wording of section 9.4 (it names both
   row 2 and row 6), and correct the helper's JSDoc first line to
   `Every TypeScript file of the core, as a path under \`src\`.` if slice 2's listing was followed
   exactly; section 9.4 shows the final text of both.
6. `(cd libs/wbs/application/core && bun test src)` → exit 0 with `C` over `F` (observed `543 pass`,
   `0 fail`, 54 files); `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache`
   → exit 0; append to `verify.md`; then `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `refactor(core): name the port in every core test that publishes`.

### Slice 5 — Classification, the task note, and the close

**Step 0.**

```sh
base=$(git rev-parse HEAD)
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
python3 -c "import json,sys; e=[x for x in json.load(open('docs/code-organization/kinds.json'))['entries'] if x['path']=='libs/wbs/application/core/src/service/broadcast.ts']; sys.exit(0 if len(e)==1 else 1)" \
  && echo "gate: one broadcast row"
grep -cF "- [ ] 1.2 Split \`broadcast.ts\`:" openspec/changes/adopt-di-composition/tasks.md
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
```

Call the first number `K` and record it; the end of this slice requires **`K`, unchanged**. It was **95**
on the rehearsed tree, which is historical evidence rather than the requirement. Expect the gate line,
**1**, then exit 0.

1. Rewrite the `service/broadcast.ts` entry **in place** as section 9.7 shows: same `path`, same `kind`,
   new `disposition` and `rationale`. **Add no entry** for `ports/project-event.ts` or
   `ports/event-port-boundaries.test.ts`: `service-kinds.ts:17-21` scans only the two `src/service`
   directories and `src/use-cases`, and a row for an unscanned path fails
   `every backend service file with no kind suffix is classified exactly once`.
2. Add the note of section 9.8 under task 1.2 in `openspec/changes/adopt-di-composition/tasks.md`.
   **Tick no box:** 1.2's second half, the collector's move into Plan commands, is not done and section 4
   says why.
3. Append to `verify.md`: `K`, the closing counts, the port/adapter decision with its map citations, and
   the two findings of section 11 that later packets must not inherit.
4. `GSETTINGS_BACKEND=memory bunx prettier --write` on `docs/code-organization/kinds.json` and the two
   OpenSpec files, then `--check` the same paths → exit 0.

| Command                                                                                                | Expect                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The README's strict OpenSpec validation block, `jq -s -e` contract included                            | exit 0, and `jq -r '.summary.totals'` prints `items` and `passed` equal, `failed` 0 (observed `113`/`113`/`0`, unchanged: this packet opens no change) |
| `python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"` | `K`, the step-0 value, unchanged                                                                                                                       |
| `NX_DAEMON=false bunx nx run-many -t typecheck,lint,test:unit -p wbs-core --skip-nx-cache`             | exit 0 (observed)                                                                                                                                      |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`                                  | exit 0 (observed)                                                                                                                                      |
| `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                      | exit 0 (observed)                                                                                                                                      |
| `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-gw-01,wbs-mcp-01 --skip-nx-cache`                | exit 0 (observed). Neither app imports `@wbs/core`, which is why only the type check is asked of them here                                             |
| `GSETTINGS_BACKEND=memory bunx nx format:check --all`                                                  | exit 0                                                                                                                                                 |

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

Slice 2 creates it exactly as below **except** that its `.filter` line reads
`.filter((path) => path.endsWith('.ts') && !path.includes('.test.'))` and the three `Proof:` comments are
absent; slice 3 adds those comments and slice 4 widens the filter to the form shown and extends the first
one. The text below is the finished file, 81 lines, Prettier-clean.

```ts
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';

const coreSource = fileURLToPath(new URL('..', import.meta.url));
const portHome = 'ports/project-event.ts';
const collectorHome = 'service/broadcast.ts';
const eventNames = ['Broadcaster', 'ProjectEvent', 'subscriptionFor'] as const;
// Both patterns are anchored at the start of a line, because this file's own regular expression
// literal and its `Proof:` comments quote the very text they look for: unanchored, with the tests
// scanned, it named `ports/event-port-boundaries.test.ts` for both rules (observed 2026-09-22).
const importsFromBroadcast = /^import(?<clause>[^;]*?)from\s+'(?<from>[^']*\/broadcast)';/gms;
const declaresEventName = /^export\s+(?:interface|type|function)\s+(?<name>[A-Za-z]+)/gm;

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
  // throw deleted the same wrong root left the sideways-import test passing on an empty scan, 1 pass
  // and 1 fail (2026-09-22).
  for (const required of [portHome, collectorHome]) {
    if (!found.includes(required)) {
      throw new Error(`the event-port scan read no ${required} under ${coreSource}`);
    }
  }
  return found;
}

describe('the neutral project-event port', () => {
  it('is where every importer of the event contracts names them', async () => {
    const sideways: string[] = [];
    for (const path of await scannedSources()) {
      const source = await readFile(`${coreSource}${path}`, 'utf8');
      for (const match of source.matchAll(importsFromBroadcast)) {
        const clause = match.groups?.['clause'] ?? '';
        for (const name of eventNames) {
          if (new RegExp(`\\b${name}\\b`).test(clause)) sideways.push(`${path}: ${name}`);
        }
      }
    }

    // Proof: putting `import type { Broadcaster } from './broadcast';` back into
    // service/step.service.ts failed here with `+ "service/step.service.ts: Broadcaster"`, while
    // `wbs-core:typecheck` still exited 0; putting it back into service/working-plan.test.ts failed
    // here naming that test file, which is what scanning the tests too buys (2026-09-22).
    expect(sideways.sort()).toEqual([]);
  });

  it('holds the only declaration of each event contract', async () => {
    const declared: string[] = [];
    for (const path of await scannedSources()) {
      const source = await readFile(`${coreSource}${path}`, 'utf8');
      for (const match of source.matchAll(declaresEventName)) {
        const name = match.groups?.['name'];
        if (name !== undefined && (eventNames as readonly string[]).includes(name)) {
          declared.push(`${path}: ${name}`);
        }
      }
    }

    // Proof: declaring a second `export interface Broadcaster` in testing/broadcast-fixture.ts and
    // extending it failed here with `+ "testing/broadcast-fixture.ts: Broadcaster"`, while
    // `wbs-core:typecheck` exited 0; the same duplicate inside service/broadcast.ts is additionally
    // refused by the barrel as TS2308 (2026-09-22).
    expect(declared.sort()).toEqual([
      `${portHome}: Broadcaster`,
      `${portHome}: ProjectEvent`,
      `${portHome}: subscriptionFor`,
    ]);
  });
});
```

`readdir` throws when the directory is gone, and the guard throws when the scan read neither anchor
file, so neither failure can present itself as an empty violation list. The two `match.groups` reads are
the only defaulting in the file and they are not state: a capture group that did not participate means
the clause was empty, and an unnamed declaration cannot be one of the three contracts.

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

### 9.9 The duplicate declaration slice 3 injects

Only as fault row 3, never as a prescription:

```ts
/** A second definition of the port's contract, drifting from it structurally. */
export interface Broadcaster {
  publish(projectId: string, event: ProjectEvent): Promise<void>;
  latestSeq(projectId: string): Promise<number>;
}
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
`broadcast.ts`, `index.ts`, the port and its check — plus `kinds.json`, `tasks.md` and `verify.md`:
thirty-two paths, measured as `git diff --name-only f862a15a` on the rehearsed tree, where `tasks.md`
was the one path the rehearsal did not touch. Subjects are the five named in section 7. Never `--no-verify`.

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
