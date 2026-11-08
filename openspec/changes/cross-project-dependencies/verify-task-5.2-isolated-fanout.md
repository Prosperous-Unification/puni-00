# Task 5.2 bounded isolated dependency fanout packet

Base: `5229c8322`. This packet does **not** complete task 5.2, task 8.4, activate semantics, publish or deploy anything.

## Implemented boundary

The borrowed SQLite fanout capture now observes external relationship components in isolated capacity mode without invoking a scheduler. It retains scoped surviving project identities even after a project loses its last incident relationship; incident member fingerprints include scheduling input, progress, actuals, blockage/parallel/measure facts and project/row/step labels. Relationship keys retain authored identities, endpoints, scopes and type, excluding audit stamps.

`compareDependencyFanout` compares old and new components separately, includes both endpoints of changed relationships as causes, excludes self/deleted recipients, and deduplicates sorted recipient/cause pairs with existing shared fanout. Existing committed `elsewhere_changed` event rows, replay and gateway delivery are reused. Events contain IDs rather than labels. Command, admitted project/step and scoped recovery writers admit this isolated observation arm; their existing event-recording transaction and delivery after writer release remain in place.

## Focused verification

Observed locally in the isolated `/tmp/puni-dependency-fanout` clone. Final command outcomes are recorded below before committing; they are not a canonical host gate.

```sh
bun test libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/read-continuation.db.test.ts libs/wbs/application/core/src/service/committed-fanout.test.ts libs/wbs/application/core/src/service/shared-people-fanout.test.ts libs/wbs/application/core/src/module/plan-commands/module.test.ts apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts apps/wbs/be-01/src/controller/fanout-command.controller.db.test.ts apps/wbs/be-01/src/controller/fanout-selected-rank.controller.db.test.ts
bunx tsc --build --force apps/wbs/be-01/tsconfig.json
bun tools/tool-devsync/src/typecheck-modules.ts libs/wbs/application/core/src/module
```

Final observed outputs: **131 pass, 0 fail, 450 assertions across 8 files**; backend project-reference typecheck exit 0; module typecheck exit 0; changed-path ESLint exit 0 with no warnings or skipped-rule output; changed-path Prettier check exit 0; `git diff --check` exit 0.

The backend project-reference build covers core/store/backend types; the separate module check uses the configured core module checker. Changed-path ESLint runs after `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show project wbs-core --json` creates the local Nx graph. An initial lint attempt reported skipped module-boundary rules because that graph was absent; it is not counted as final lint evidence. Prettier checks only the packet's changed files. No frontend contracts or consumers changed.

The focused witnesses distinguish these boundaries:

- Mounted project PATCH: rename and abbreviation-only edits invalidate the downstream project and a transitive tail, preserve every authored relationship byte, and deliver nothing to the foreign component. This establishes label-reader invalidation, **not** correct rendered connected labels.
- Mounted committed transport: an independent SQLite reader sees the changed project header and an independent writer enters during delivery.
- Mounted rejected command batch: a valid earlier estimate mutation followed by a missing-row mutation returns 404, restores estimates/history/events/sequencers, and emits no dependency event.
- Real borrowed SQLite capture plus real event ledger: predecessor completion with no shared people produces the successor event; rolling the writer back removes progress, event and sequencer rows together. This is **not** a mounted successful progress-command witness.
- Real SQLite relationship removal: both surviving endpoints receive invalidations after their last relationship disappears.
- Committed core consumer: old/new split and merge, authored relationship semantic change, and no synthetic path assembled from old/new edges.

## Watched R5 faults

Each fault was applied to the production path, observed failing the named test, then restored. Adjacent `Proof:` comments describe the observed boundary.

| Fault                                                                                    | Observed negative                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restrict dependency traversal to the direct cause                                        | Mounted rename loses the transitive tail event; exit 1.                                                                                                                                                  |
| Omit progress from the incident fingerprint                                              | Real borrowed-writer completion returns no successor event; exit 1.                                                                                                                                      |
| Omit project abbreviation from the fingerprint                                           | Mounted abbreviation-only PATCH retains one event rather than two; exit 1.                                                                                                                               |
| Remove the missing-endpoint refusal                                                      | Missing-endpoint test gets property-access TypeError rather than the named invariant; exit 1. Separately injected unreadable capture throws unchanged.                                                   |
| Deliver committed dependency rows inside the admitted writer and suppress later delivery | Mounted transport observes old `Upstream` instead of `Committed name`, then zero successful deliveries; exit 1.                                                                                          |
| Disable isolated dependency eligibility in command composition                           | Missing-delivery capability negative resolves instead of refusing; exit 1.                                                                                                                               |
| Remove external relationship organization filtering                                      | Mounted foreign-edge fixture returns 500 at the remaining scoped-endpoint refusal instead of 200; exit 1. This demonstrates scope refusal, **not** label disclosure or an independently successful leak. |
| Union old/new relationship edges during traversal                                        | Core consumer invents A/C pairs in the mixed-topology negative; exit 1.                                                                                                                                  |
| Retain only current incident identities                                                  | The real SQLite last-relationship-removal test loses both surviving endpoint events; watched red before fixing.                                                                                          |
| Omit dependency organization identity comparison                                         | Core committed consumer resolves a mismatched-organization capture instead of refusing; watched red before adding the guard.                                                                             |

## Remaining integration and verification

- Shared capacity mode with external relationships remains unsupported by this capture. Its existing ordinary `snapshot.capturePlan`/`readChain` path uses the local captured-input boundary; this packet leaves that path in place and supplies no dependency observation there. It does not establish shared-person bridges or shared connected scheduling invalidation.
- Successful mounted progress/claim/topology command and own-project connected-tree delivery depend on the separate tree integrator. This packet does not suppress their existing connected projection refusal or claim that an HTTP 500 is success. Mounted topology acceptance remains open; old/new recipient selection is covered at committed core and SQLite capture/ledger boundaries.
- Rank-edit invalidation is not implemented by these incident fingerprints. Calendar/capacity/estimate/engine input is captured where represented by the existing schedule input or settings, but dedicated mounted acceptance for those edits is not supplied here.
- Visible connected endpoint labels, consumer refetch/render correctness, full gateway socket/replay acceptance, shared-mode component fanout, mode switching and full component atomicity across every writer remain open under task 5.2.
- Canonical h2/h4 exact-SHA gate, full CI/lint/build, browser acceptance, OpenSpec validation, activation, release and deployment were not run. Dependencies were reused through a local ignored `node_modules` symlink; no frozen installation was asserted.

## Changed paths

- `libs/wbs/application/core/src/service/shared-people-fanout.ts`: independent dependency component comparison and captured value.
- `libs/wbs/application/core/src/service/committed-fanout.ts`: union/deduplicate/sort dependency recipient pairs with existing bookings pairs.
- `libs/wbs/application/core/src/ports/fanout-capture-store.ts`: required nullable isolated observation arm.
- `libs/wbs/application/core/src/ports/project-event.ts`: existing event's domain documentation includes dependency facts and labels.
- `libs/wbs/adapters/store-sqlite/src/fanout-capture.ts`: isolated borrowed capture, scoped incident facts and surviving identities.
- `libs/wbs/application/core/src/module/plan-commands/composition.ts` and `src/http/recovery-write.ts`: isolated capture eligibility through existing committed writer/delivery seams.
- The new mounted `cross-project-events.controller.db.test.ts`, existing `fanout-capture.db.test.ts`, `committed-fanout.test.ts` and command `module.test.ts`: boundary witnesses and required capture fixture updates.

The packet intentionally avoids `work-item.resource.ts`, PlanTree ports/contracts and shared projection/composition ownership seams.
