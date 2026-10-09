# Test axes implementation shape

## Scenario identity

`openspec/scenario-allocations.json` is one versioned, append-only event journal. The only current index is derived from it. `import` reserves existing hand-written IDs unchanged; `allocate` issues the next unused ordinal in the capability namespace; `split` issues a new ID with the old scenario as predecessor; `rename` retains the ID and records its prior title and source revision; `retire` leaves a tombstone. A new allocation never reuses any ID present in the journal, including retired ones.

The `twilight-burokrat scenario` command reads this journal and a selected OpenSpec spec, then prints a proposed journal/spec edit. The caller applies and reviews that proposal. The allocator has no write side effect. Candidate/base continuity is deferred until Burokrat has a production rule path that can read both trusted base and candidate journal blobs. Comparing only a candidate journal with itself would let a deleted retirement event disappear.

The current adopted set contains the three identified specs: the active `project-assignment-reads` spec and the `service-taxonomy` and `test-axes` change specs. These have 73 distinct identifiers imported into the first journal. The current command selects one spec path explicitly. The B4 whole-tree selector must choose an active canonical spec from `openspec/specs/<capability>/spec.md` or an active change's `openspec/changes/<change>/specs/<capability>/spec.md`; archived copies and a future synced duplicate are one scenario lineage, not separate obligations. Other legacy OpenSpec headings currently lack IDs (4,059 at import time); they are migration debt, not evidence of global provenance or full coverage. Burokrat must expose this debt as it expands adoption.

## Coverage boundary

The existing `project-assignment-reads` tests cite its three imported IDs. The pilot command joins only fresh reports from its declared API and Unit targets and prints a hand coverage table. B4 consumes the journal and the same selected scenario identities to produce certifying scenario and structural ledgers, enforce T2, and validate dispositions. The static Burokrat judges recorded reports; it does not run test targets.

## Assumptions to revisit

The allocator derives the ID namespace from the final spec directory name and never renumbers after a scenario moves. Cross-capability moves need an explicit successor/predecessor policy before they can be automated. The first journal imports only currently identified active specs; expanding adoption requires an explicit reviewed import or allocation step.
