# Task 6.3 regression repair

Parent packet: `64d9c71377`, based on `833ceff80`. Isolated worktree:
`/tmp/puni-start-admission`. Task 6.3 remains open and external authoring remains
dormant. This correction does not implement task 8.4 publication.

## Scenario reconciliation

The exact three reviewed legacy suites reproduced **38 pass, 63 fail, 269
assertions**. An unspecified claim requested Dev and QA while QA's local FS
prerequisite remained unfinished, so later assertions lacked their setup claims.

- Single-step resource, race, identity and delegation scenarios now explicitly
  acquire Dev. They retain their original holder, exhaustion, release, parent,
  revision, journal and rollback assertions.
- Simultaneous Dev/QA occupancy and multi-claim restoration cases explicitly
  establish preexisting QA progress. They exercise continuation of real work,
  including multi-claim occupancy and last-release behavior. The default workflow
  remains sequential.
- The all-unfinished positive still finishes Dev and gives QA a worked estimate,
  then verifies that QA alone is acquired and stated. The matching memory and
  SQLite negatives request all unfinished steps and verify refusal plus exact
  restoration of rows, journal, progress, claims and occupancy after an earlier
  successful staged rename.
- The frontend command refusal switch explicitly carries the existing
  `referenced_by_external_dependency` refusal. The real plan writer reports the
  existing fallback sentence once, without retry or reread; exhaustiveness
  remains enforced.

## Fresh verification

```sh
bun test apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts libs/wbs/domain/domain/src/claim.test.ts libs/wbs/application/core/src/module/work-item/startable.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts libs/wbs/adapters/store-sqlite/src/read-snapshot-lifetime.db.test.ts libs/wbs/application/core/src/module/plan-commands/claim-command.test.ts libs/wbs/adapters/store-sqlite/src/claim-race.db.test.ts libs/wbs/adapters/store-sqlite/src/resource-occupancy.db.test.ts
```

**207 pass, 0 fail, 860 assertions** across eight files:
[focused-green.log](focused-green.log). The original three suites alone passed
101/101 before the two conformance negatives were added; they now contain 103
cases: [legacy-green.log](legacy-green.log).

From `apps/wbs/fe-01`:

```sh
TZ=UTC bunx vitest run --config vitest.node.config.ts src/modules/plan-writer/plan-writer.test.ts
```

**19 passed, 0 failed**: [frontend-green.log](frontend-green.log). Vitest emits
its existing native-config compatibility warning about `__dirname` and JSON
import attributes.

From the worktree root, each exited 0 without diagnostics:

```sh
bunx tsc --build --force apps/wbs/fe-01/tsconfig.json --pretty false
bunx tsc -p libs/wbs/application/core/tsconfig.spec.json --noEmit --pretty false
bunx tsc -p libs/wbs/adapters/store-sqlite/tsconfig.spec.json --noEmit --pretty false
bunx eslint apps/wbs/fe-01/src/components/wbs/plan-refusal.ts apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts libs/wbs/adapters/store-sqlite/src/claim-race.db.test.ts libs/wbs/adapters/store-sqlite/src/resource-occupancy.db.test.ts libs/wbs/application/core/src/module/plan-commands/claim-command.test.ts libs/wbs/domain/domain/src/claim.ts
```

`bunx openspec validate cross-project-dependencies --strict --json` exited 0
with one valid change and no issues.

Changed source and Markdown files were formatted and checked with Prettier;
`git diff --check` passed.

## Observed negative proofs

- With `decideClaim`'s fresh-step admission predicate replaced by `false`,
  `bun test libs/wbs/adapters/store-sqlite/src/resource-occupancy.db.test.ts -t 'refuses all unfinished steps atomically'`
  returned **0 pass, 2 fail**, acquiring Dev and QA instead of refusing on both
  stores: [atomic-mutant.log](atomic-mutant.log). The predicate was restored
  before the final eight-file green run. Adjacent production and test Proof
  comments record the fault.
- Before the explicit frontend command arm, the real writer regression reached
  `unreachable` and threw `Unexpected response variant: object`: **18 pass,
  1 fail**, [frontend-red.log](frontend-red.log). Adding the arm produces the
  19-case green run above; its adjacent Proof comment records the observation.

## Remaining integration blockers and checks not run

The mounted connected claim's post-commit HTTP 500 remains an owning task 8.4
integration problem. This packet does not suppress publication, substitute local
projection, swallow the error or remove admission.

The broader task 6.3 matrix remains open: mounted shared-person bridge/expanded
pairs/remote holds, concurrent execution-read snapshot, trusted completeness
mutations, and authenticated MCP transport. The new all-step conformance case
adds earlier-command rollback coverage but does not complete that matrix.

Not run here: full backend/frontend/MCP test suites, module-wide lint, complete
Nx gates, browser checks, CI secrets/migration lint or the exact-SHA host gate.
No release, activation, migration, merge or push was performed.
