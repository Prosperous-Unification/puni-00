# Bounded task 10.1 current WorkItemService authoring consumption

2026-10-23; isolated branch `agent/current-authoring`, base `66df7ee07`.

## Scope

WorkItemService validated its required explicit authoring port at construction,
then retained the boolean for typed add, update, remove, typed replay validation
and history admission. A private getter now invokes the existing strict parser at
those same guard positions. Constructor validation remains intact. Principal,
owner and endpoint checks retain their order before the current capability read.
The already-current duplicate/copy path is unchanged. History first checks the
pure `requiresExternalAuthoring` predicate before reading the capability, so
exact derived incident mappings retain their existing independence from general
authoring authority.

Production composition still supplies literal inactive authority. This fixes a
latent future-integration cache defect; it does not activate external authoring,
wire durable `readDependencyAuthoring`, advertise semantics, or finish task 10.1.

## Mounted SQLite evidence

`current-dependency-authoring.controller.db.test.ts` constructs the actual service
inside the real SQLite writer and dependency context. It changes a getter-backed
port only after service construction. The matrix covers inactive and throwing
reads after active construction, and active reads after inactive construction,
for add, update local-to-external, update external-to-local, remove, incoming
copy, undo and redo. Missing/unknown state after construction also throws.

Every refusal compares every table (including row revisions, journal and durable
events). The fixture requires zero broadcaster publications. Two compound cases
stage a successful local create before external refusal/throw and compare the
same complete table certificate. Add admission explicitly proves principal,
foreign successor and missing predecessor precedence with zero extra capability
reads. A local create succeeds with a capability that became unreadable after
construction. Derived incident undo/redo also succeeds without reading authority
that became unreadable, with an exact capability-read count assertion.

The initial regression run against the untouched construction cache was **4 pass,
14 fail**: both add transition tests and inactive/unreadable add, both update
directions, remove, undo and redo failed their actual refusal/throw assertions.
The two copy negatives passed because copy was already current. This initial run
preceded the later activation matrix, batch and malformed-state additions.

A second watched production fault replaced only the getter's parser call with
`return true`. `current capability inactive admits or refuses remove atomically`
failed its actual outcome assertion: expected inactive refusal, received
`{ ok: true, value: null }` (**0 pass, 1 fail**, 26 filtered). The source was
restored. This is a consumer proof; it does not claim that every layered entry,
`typedRefusal` or replay guard was independently killed.

A targeted control first failed with the fresh getter evaluated before the pure
history authoring predicate: `derived incident history does not require general
external authoring` threw unreadable-authority during undo (**0 pass, 1 fail**).
Moving that predicate before the getter restored the existing exemption; both
undo and redo succeed with zero additional capability reads. This is adjacent to
the history guard as a separate Proof comment.

## Validation and limits

Final command receipts are recorded below. Imports were not modified or newly
exercised by this packet. Endpoint precedence additions target add; the existing
broader lifecycle/history/copy tests remain the other admission coverage. This
matrix does not exercise real production activation, durable authority wiring,
live read admission, semantic advertisement or deployment participant exclusion.
Zero-publication assertions observe the semantic fixture collector; this packet
does not add an independent HTTP postcommit-publication fault proof.
An isolated host gate and independent review remain required on the integrated
SHA. Parent 10.1 remains unchecked.

Receipts:

- Focused mounted matrix before the final assertion-typing cleanup: **29 pass,
  0 fail**, 392 assertions.
- Broader command: `bun test libs/wbs/application/core/src` plus the lifecycle,
  history, copy and current-authoring mounted files, `--timeout=10000`: **1593
  pass, 19 fail** across 126 files. The 19 failure names exactly match fresh base
  `66df7ee07` reproductions: module-boundaries alone (**0 pass, 1 fail**, 14
  filtered) and the eight failing HTTP/admission/plan-command fixture files
  (**26 pass, 18 fail**). The former reports existing saved-plans connected-history
  repository-port debt; the remaining failures include missing incident stores and
  prerequisite-fixture expectations. No baseline failures were repaired here.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:build:portable`:
  passed, 649 modules bundled.
- Changed-file Prettier check: passed.
- `bunx openspec validate cross-project-dependencies --json`: passed.
  `--strict --json`: failed on 15 warnings and no errors. A fresh archive of base
  `66df7ee07` produces an exactly identical issue array (long existing requirement
  text). No new strict-validation issue was introduced.
- Final scoped suite after assertion typing and derived-history correction:
  `bun test` over current-authoring, cross-project lifecycle/history/copy and
  `work-item.resource.test.ts`, `--timeout=10000`: **237 pass, 0 fail**, 2099
  assertions across five files. The new matrix contributes 30 cases.
- `bunx openspec validate --all --json`: **271/271 passed** (253 changes,
  18 specs).

Final scoped test command:

```sh
bun test \
  apps/wbs/be-01/src/controller/current-dependency-authoring.controller.db.test.ts \
  apps/wbs/be-01/src/controller/cross-project-dependency-lifecycle.controller.db.test.ts \
  apps/wbs/be-01/src/controller/cross-project-dependency-history.controller.db.test.ts \
  apps/wbs/be-01/src/controller/cross-project-dependency-copy.controller.db.test.ts \
  libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts \
  --timeout=10000
```

The broad command replaces the last file with
`libs/wbs/application/core/src`. Baseline reproduction used
`git archive 66df7ee07` extracted into a separate directory, with the same locked
workspace dependencies, then ran `module-boundaries.test.ts` restricted to
`closed feature modules do not reference repository ports and debt stays live`.
The second baseline command ran `http/step.routes.test.ts`,
`use-cases/admission.test.ts` and the six `module/plan-commands/` files
`resource-command.test.ts`, `resource-schedule.test.ts`, `admitted-write.test.ts`,
`assignee-calendar.test.ts`, `plan-command-scope.test.ts` and
`plan-command-admission.test.ts` under `libs/wbs/application/core/src`.

- Final configured check command:
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p wbs-core wbs-be-01 --parallel=2 --skipNxCache`:
  **all six tasks passed**, cache skipped. This includes both module typechecks.
  Initial failed attempts identified and corrected test import ordering and Bun
  matcher typing; the final run checks the corrected assertion helper and derived
  history predicate order.
- Final uncached `wbs-core:build:portable`: passed. Full backend/full repository
  builds and an isolated h2/h4 gate were not run for this bounded local packet.
