# Test axes implementation shape

## Scenario identity

`openspec/scenario-allocations.json` is one versioned, append-only event journal. The only current index is derived from it. `import` reserves existing hand-written IDs unchanged; `allocate` issues the next unused ordinal in the capability namespace; `split` issues a new ID with the old scenario as predecessor; `rename` retains the ID and records its prior title and source revision; `retire` leaves a tombstone. A new allocation never reuses any ID present in the journal, including retired ones.

The `twilight-burokrat scenario` command reads this journal and a selected OpenSpec spec, then prints a proposed journal/spec edit. The caller applies and reviews that proposal. The allocator has no write side effect. Candidate/base continuity is deferred until Burokrat has a production rule path that can read both trusted base and candidate journal blobs. Comparing only a candidate journal with itself would let a deleted retirement event disappear. The approved B3 integration boundary is recorded in [the candidate/base design note](../../../docs/superpowers/plans/2026-10-09-test-axes-b3-candidate-base.md).

The current adopted set contains the three identified specs: the active `project-assignment-reads` spec and the `service-taxonomy` and `test-axes` change specs. These have 73 distinct identifiers imported into the first journal. The current command selects one spec path explicitly. The B4 whole-tree selector must choose an active canonical spec from `openspec/specs/<capability>/spec.md` or an active change's `openspec/changes/<change>/specs/<capability>/spec.md`; archived copies and a future synced duplicate are one scenario lineage, not separate obligations. Other legacy OpenSpec headings currently lack IDs (4,059 at import time); they are migration debt, not evidence of global provenance or full coverage. Burokrat must expose this debt as it expands adoption.

## Coverage boundary

The existing `project-assignment-reads` tests cite its three imported IDs. The pilot command joins only fresh reports from its declared API and Unit targets and prints a hand coverage table. B4 consumes the journal and the same selected scenario identities to produce certifying scenario and structural ledgers, enforce T2, and validate dispositions. The static Burokrat judges recorded reports; it does not run test targets.

## Level classification and runner evidence

`libs/shared/domain/test-levels` owns the pure ten-row precedence function. It has no runner or policy imports, and its caller supplies the frontend source root. Burokrat supplies Conformance, Architecture, Performance, Browser, frontend Node and manual membership evidence, then applies that function to the selected candidate. Devsync consumes the same public library for target checks. The shared-domain placement satisfies Nx's existing product and scope rules for the Burokrat application and the product-less devsync tool; Burokrat still owns discovery, thresholds and enforcement.

A collection adapter must produce either a nonempty file plan with its discovery inputs or an explicit `no-cases` result with a reason. The earlier pure planner had no production caller and was removed; the union is a required future runner-boundary contract, not an enforced Burokrat check today. The three new find-based memory/SQLite level targets currently clear their prior report, fail on selector errors, and refuse empty selections before Bun can default-discover another level. Performance currently has no fixture with declared thresholds; an empty Performance target must refuse with `no-cases`, without a passing JUnit report. Task 2.1 remains open until a real Performance fixture proves isolated execution. Manual requires a reviewed procedure and report bound to source and environment; its validator must refuse absent or stale evidence and may never synthesize a human pass.

The current JUnit target additions cover separate store-memory Unit and Conformance runs, store-sqlite Conformance, and frontend Unit/View commands. The frontend's UTC View, Auckland View, Node Unit and root Unit collections are distinct. Existing legacy targets remain intact; `wbs-store-memory:test:unit` is an explicit mixed aggregate. A later runner adapter must bind each JUnit report to target, config, candidate and exact collected files in a companion manifest, and reject report reuse or overwrite across invocations before Burokrat treats it as coverage.

## Assumptions to revisit

The allocator derives the ID namespace from the final spec directory name and never renumbers after a scenario moves. Cross-capability moves need an explicit successor/predecessor policy before they can be automated. The first journal imports only currently identified active specs; expanding adoption requires an explicit reviewed import or allocation step.
