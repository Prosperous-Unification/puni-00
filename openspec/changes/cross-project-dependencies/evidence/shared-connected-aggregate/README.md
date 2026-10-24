# Task 8.4 bounded shared connected aggregate packet

2026-10-22; base `61461cc54b11235f0f3cab4a846107019a364c30`; isolated clone
`/tmp/puni-shared-connected-impl`. This packet leaves task 8.4 unchecked.

## Implemented boundary

The shared aggregate classifies complete undirected external/person closures and
captures/derives each external component once inside its existing observation.
Every readable ranked project gets one entry with explicit `projectId`.
Component entries share a detached connected read and carry `basis: null`.
Nonexternal components retain the old rank-chain schedule and incoming basis.
Direct and aggregate reads use the same private connected assembly. The core
aggregate presenter uses the existing pure member projector/presenter; it has no
new read, scheduler or optimizer admission call.

Connected entries bypass existing load and roll-up process caches. The new
mounted witness warms ordinary shared caches first, introduces an external FS
edge with the successor ranked first, and holds target revision/event sequence
fixed while moving, clearing and restoring only the foreign calendar and then
changing only the foreign required engine. Load, organization weekly totals,
successor-only custom Space roll-ups and in-progress refresh. Removing the edge
restores the ordinary shared result without cache contamination.

Store witnesses include person-only bridge peers plus an ordinary component,
two disconnected external components, one full capture/member, one resolved
schedule/component, one attempts-metadata read/member, exact entry identity,
direct/member placement agreement, committed concurrent calendar/link/label
edits, staged borrowed relationships, transaction ownership and reader expiry.
Unavailable calendar and optimized reads preserve all durable solver/cache,
generation/slot/queue, execution-attempt and event rows.

## Watched red and independent production faults

Initial command:

```sh
bun test libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts --test-name-pattern 'shared aggregate reuses'
```

Before implementation: 0 pass, 1 fail, `connected aggregate is unsupported`.
After implementation: 1 pass, 0 fail. The witness was subsequently expanded with
a shared-person-only peer and ordinary shared project.

Each fault below was applied separately to production source, watched fail,
restored, and followed by restored-source green runs. Raw failure output is
adjacent. A nonzero command alone is not the assertion: each row names the
observed contract failure.

| Fault                                                            | Focused command pattern                     | Observed failure                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Force `hasExternal = false` in aggregate dispatch                | mounted `shared aggregate load`             | load 500 instead of 200/dependency dates; [log](shared-proof-rank-only.log)                        |
| Ignore completed connected-read memo                             | store `shared aggregate`                    | repeated full input captures/component derivations; [log](shared-proof-memo.log)                   |
| Substitute empty incoming-calendar hash for connected null basis | mounted `shared aggregate load`             | stale ordinary target bookings after external edge; [log](shared-proof-null-basis.log)             |
| Project all connected entries using first captured member        | mounted `shared aggregate load`             | incorrect selected project dates/identity; [log](shared-proof-member-identity.log)                 |
| Omit person-neighbor traversal                                   | store `shared aggregate reuses`             | bridge-only peer no longer shares connected read; [log](shared-proof-person-closure.log)           |
| Remove owned observation begin/commit/rollback                   | store `shared aggregate captures calendars` | first observation sees `Next remote` instead of captured `a2`; [log](shared-proof-transaction.log) |
| Read borrowed aggregate on fresh connection to same DB           | store `borrowed shared aggregate`           | staged connected member becomes ordinary shared; [log](shared-proof-borrowed.log)                  |

Production dispatch, component memo, null basis, member selection and transaction
seams contain adjacent `Proof:` comments. Existing person-closure proofs are
preserved and independently rerun here.

## Verification

All commands ran from the isolated clone. Bun/Nx only.

- Nine-file regression command: `bun test` with store
  `connected-live-plan.db.test.ts`, `chain-snapshot.db.test.ts`,
  `read-snapshot-lifetime.db.test.ts`; core `connected-tree.test.ts`,
  `person-load.feature.test.ts`, `space.resource.test.ts`; backend
  `cross-project-live.controller.db.test.ts`, `person-load.controller.db.test.ts`,
  `space-organization.controller.db.test.ts`: **204 pass, 0 fail**, 922 assertions.
- After adding durable unavailable-state witnesses and converting the existing
  test's dynamic core imports to static imports for Nx boundary lint:
  `bun test libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts`:
  **18 pass, 0 fail**, 95 assertions.
- Mounted focused shared/isolated unavailable and warm-cache command:
  `bun test apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts --test-name-pattern 'shared aggregate load|load and space preserve'`:
  **9 pass, 0 fail**, 143 assertions. Missing calendar, calendar range, missing
  optimizer adapter and installed-but-connected-unsupported adapter are covered.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-store-sqlite,wbs-be-01`:
  **5 successful tasks**, no failures. Final configured store-only typecheck
  rerun after the test import changes also succeeded.
- Configured Nx core/backend lint succeeded. Initial store lint failed on an
  unused import, new test lint errors and the existing dynamic core test imports;
  those were fixed. Nx's stale graph still reported the removed dynamic imports;
  `bunx nx reset --only-workspace-data` refreshed that generated state, then
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:lint`
  **succeeded**.
- `bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'staged|borrowed|arrange|batch'`:
  **6 pass, 0 fail**, 32 assertions; staged preflight, staged work-item dates,
  borrowed non-admission and captured optimization arrange/freeze regressions.
- Prettier check on all eight changed source/test files: **all matched files use
  Prettier code style**. `git diff --check`: clean.
- `./node_modules/.bin/openspec validate --all --json`: **268 passed, 0 failed**
  (250 changes, 18 specs).

Installed optimizer fixtures emit their existing modeled background
`connected optimization input is unsupported` error logs during fixture edits;
the read assertions pass and preserve structured unavailability.

## Remaining scope and unverified checks

No host gate, full CI build/test/format, secrets scan, migration lint, frontend
browser gate, task 8.5 benchmark, activation or deploy was run in this packet.
The architecture's full connected-specific mounted authority/corruption matrix,
modeled cycle load/Space case, isolated-cache-to-shared transition, independently
mutated consumer null guards and suspended inner callback lifetime matrix were
not added here; existing shared authority/lifetime regressions were rerun.
Connected arrangement/restart/optimizer admission and history/export remain
separate unfinished task surfaces. This packet does not claim task 8.4 complete.
