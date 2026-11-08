# Connected Fast tree foreign person holder correction

The first mounted tree packet (`f76a5bd3d`) was rejected: a shared-person target
could retain a foreign `resourcePredecessorId` while omitting the foreign slice,
so a successful HTTP response failed the production Gantt integrity check.

The pure tree projector now resolves direct foreign person predecessors against
the complete captured placement, ownership, member metadata and organization
person catalog. It returns checked holder pairs and labels in first-named order,
using the holder project's own row number. Unknown references, person mismatch,
contradictory annotations and foreign capacity blocker sets refuse projection.
The original numerical placement and readiness are unchanged.

Only the final tree DTO transfers a checked foreign person display referent to
`boundBy: elsewhere`, null local predecessor and a qualified `elsewhereHolder`.
It supplies the existing holder catalog and recomputes distinct person/elsewhere
row counts. Target-local person arrows and capacity sets remain intact. Tree
“elsewhere” includes a direct person constraint from a lower-ranked project;
the scheduler's ranked booking input remains a separate, unchanged contract.

## Fresh acceptance

- The new mounted shared-person SS fixture initially answered HTTP 200 then
  failed the actual bundled `layOutGantt` with a dangling foreign slice ID.
- The corrected mounted payload reaches production Gantt with the target row
  visible. It renders “Waits for Local Ana to finish 010 Remote row in Remote,”
  preserves 1.5→4 offsets and target-only slices, and reports person/elsewhere
  counts 0/1. The test bundles the real consumer using its frontend tsconfig;
  it changes no alias configuration or Gantt guard.
- A mixed case gives the same target row a foreign Ana floor and a local Ben
  floor: both counts are one, the local predecessor key is preserved, and
  full/paged/detail reads retain the row's 1.5→12.5 span.
- Pure production projection cases cover two distinct holders (including a
  holder row absent from authored incident endpoints), repeated one-row holders
  across steps, lower-ranked holders, captured own numbering, valid empty names,
  local team/resource capacity blocker sets and capture immutability.
- A real SQLite capture closes its owned observation, then live project, row,
  number and person labels change. Reusing the captured projection retains old
  labels and Local holder; the sealed source tripwire is untouched, one open.
- Focused projector/mounted/SQLite suites: 68 passed, 0 failed across three files.
- Chain snapshot, arrangement, numerical connected plan, mounted paging,
  resource scheduling and schedule-organization regression suites: 159 passed,
  0 failed across six files.
- Configured frontend node Vitest `gantt-geometry.test.ts`: 219 passed.

## Watched R5 faults

Each mutation was applied independently, its named test failed, and source was
restored before green verification. Logs remain under `/tmp/puni-holder-*`.

| Production fault                                                  | Observed failing witness                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Disable DTO foreign-reference transfer                            | Mounted visible-row production Gantt throws dangling predecessor                                                     |
| Omit only the holder catalog                                      | Same consumer throws its existing missing-holder-label error                                                         |
| Retain numerical schedule's person count                          | Mounted shared-person response carries 1 instead of 0                                                                |
| Select the first remote row rather than the actual referenced row | Two-holder production projection fails exact stable pair/name assertions                                             |
| Omit target-local capacity predecessor check                      | Captured foreign-capacity test fails; mounted injected capacity response changes 500→200                             |
| Omit person predecessor presence                                  | Captured missing-person-predecessor projection is accepted                                                           |
| Omit captured owner membership                                    | An injected uncaptured owner plus matching extra metadata is accepted                                                |
| Omit target-local display-reference membership                    | A local referent absent from target payload is accepted                                                              |
| Omit matching person identity                                     | Captured mismatch is accepted; mounted mismatch response changes 500→200                                             |
| Omit each contradictory person annotation predicate separately    | Local capacity IDs, team, resource or preexisting holder are each accepted by their named production projection case |
| Omit foreign floor or shared-mode predicate separately            | Foreign nonperson or isolated foreign blocker is accepted                                                            |

The reused required-evidence and label boundaries also refuse missing predecessor,
ownership, metadata, holder row, person label, derived-number dependency output,
and null project/row/person names. Their absence cases and the existing unreadable
metadata case pass; no new unchecked casts or fallback labels enter production.

## Limits

Core, SQLite and backend configured TypeScript builds pass. The isolated
frontend typecheck still fails two known baseline refusal exhaustiveness cases:
`plan-import-words.ts:115` (`external_dependencies_inactive`) and
`plan-refusal.ts:549` (`referenced_by_external_dependency`). Their combined-head
fixes are owned by the parent lane; this packet does not overwrite them.

Task 8.4/8.4a remain open. This corrects the scheduled shared-person display
contract; it does not implement unavailable trees, retained arrangement,
aggregate load/space, optimizer admission, component fanout or activation.
The parent separately reported a passing combined 6.3 nonassigning claim/event
witness; this checkout did not rerun that combined packet. Full host gate, CI,
browser acceptance and OpenSpec-wide validation were not run here.
