# Bounded shared connected fanout — 2026-10-22

Base: `9bfcffb61`. Isolated clone: `/tmp/puni-connected-fanout`.
A network fetch was attempted before implementation but sandbox DNS could not
resolve GitHub. The requested base already existed in the shared clone.

This packet partitions shared-mode observations: components containing external
relationships capture raw semantic/label facts plus shared-person bridges;
components without external relationships retain selected shared-booking
comparison. Each full project input is read once per observation. Fresh topology
is discovered through the existing connected-reader helper on the borrowed
writer, without optimization admission. Complete scoped inventory retains
survivors when a component loses its final external edge. Before/after comparison
continues traversing the snapshots independently and merging durable pairs once.
Step reference fingerprints now retain ordered ID/name/code/position metadata.
Explicit connected causes are filtered from the ordinary shared comparator and
validated against the complete scoped inventory.

## Verification

Initial external-only and alternating DB witnesses failed 2/11 because historical
single-project capture refused the external relationship. After implementation,
actual mounted `setProgress` returns 200, persists progress and records successor
and transitive tail invalidations in isolated and shared modes. A successor-only
refetch changes its node reading from `unknown` to `waiting`. Fixture-only raw SQL
seeds the external graph; authoring remains dormant. A mounted project PATCH
crosses a shared-person bridge and an external edge. These are HTTP requests
through composed writers, not direct repository mutations.

The DB matrix also covers alternating A–person–B–external–C–person–D,
disconnected external components, ordinary disconnected projects, staged progress,
step-code changes, one full capture per project, last-edge removal returning
surviving projects to ordinary shared capture, scoped unreadable/absent endpoints,
and rollback of durable events. Existing selected-cache/no-admission and old/new
mixed-graph tests remain green.

Fresh commands:

```sh
bun test libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts libs/wbs/application/core/src/service/committed-fanout.test.ts libs/wbs/application/core/src/service/shared-people-fanout.test.ts apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts apps/wbs/be-01/src/controller/fanout-selected-rank.controller.db.test.ts
bunx tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json apps/wbs/be-01/tsconfig.spec.json
NX_DAEMON=false bunx nx graph --file=/tmp/fanout-graph.json
bunx openspec validate cross-project-dependencies --strict --json
```

Observed: **64 pass, 0 fail, 297 assertions**; SQLite/backend-spec TypeScript
exit 0; Nx graph exit 0; strict change validation 1/1 with no issues.
Named-file ESLint passed after graph generation and correction of test-only
require-await/await-thenable diagnostics. The initial lint attempt skipped module
boundary rules without an Nx graph; that attempt is not the final lint receipt.
Named-file Prettier and `git diff --check` passed.

## Watched faults

Each fault was injected into production code independently, observed failing,
restored, and followed by the green focused run above. Adjacent `Proof:` comments
name the fault and its witness. Logs are retained beside this file.

| Fault                                                  | Observed witness                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Remove captured shared-person connections              | Mounted shared-person PATCH loses downstream/tail event; `shared-person-bridge.log`                          |
| Force isolated topology discovery in shared mode       | Alternating capture retains ordinary projects `[a1, a4]` instead of `[]`; `shared-discovery.log`             |
| Replace shared dependency projection with null         | Mounted shared completion loses successor/tail events, while isolated case passes; `external-projection.log` |
| Bypass observation-local full-input memo               | Ordinary disconnected projects captured twice; `capture-memo.log`                                            |
| Remove step-code fingerprint                           | Real staged code edit loses connected successor label invalidation; `step-code-fact.log`                     |
| Remove full-inventory absent-cause refusal             | Explicit missing cause resolves instead of throwing; `cause-inventory.log`                                   |
| Capture connected members through ordinary ranked path | External-only shared capture rejects historical capture; `ordinary-partition.log`                            |

Removing only the snapshot candidate filter did not fail the external-only
fixture, because the component remains disconnected by construction. That
redundant-filter trial supplies no independent safety claim; the ordinary writer
partition fault above is the failing witness.

## Retained limits

Task 5.2 remains unchecked. This packet does not cover every distinct mounted
estimate/date/capacity/engine/structural writer, semantic rank changes, installed
optimizer lifecycle causes, socket/replay/browser refresh, or cross-writer fault
atomicity. Connected selected optimizer runtime and durable activation remain
separate unfinished work. No production external authoring is enabled. No full
host gate, full lint/test/build, CI, deployment or activation ran. A review and
combined-branch checks remain required before integration; these local checks
are bounded evidence, not release completion.
