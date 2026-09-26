## 1. Enable typed SS and FF

- [ ] 1.1 After Stage A lands, add failing command, graph, import and snapshot cases for SS/FF, parent all-descendant pairs, uniqueness by endpoints/type, legacy compatibility and unsupported-type refusal.
- [ ] 1.2 Enable SS/FF in Stage A's typed contracts/table, history, archive and MCP; confirm its additive `migration.sql` and `down.sql` already support both types. Add no second migration unless the verified schema requires one; any needed migration must be additive with matching down.sql.
- [ ] 1.3 Inject lost type on undo/import and bypass unsupported-type validation; watch production-path tests fail, restore and add adjacent `Proof:` comments.

## 2. Model weighted constraints and FF quantization

- [ ] 2.1 Add failing Fast/CP-SAT golden cases for SS, FF, negative FF weight, zero-duration unknown endpoints, parent expansion and the 0.030/0.021 FF rounding counterexample.
- [ ] 2.2 Add typed weighted edges to versioned wire, CP-SAT constraints and the Q=48 W_FF bound. Independently recompute W_FF from canonical real durations; validate materialized real boundaries and active deadlines. Update hash, cache contract and corpora.
- [ ] 2.3 Inject a one-unit-too-small FF bound, forged wire weight or omitted real-materialization check; watch independent validator tests fail, restore and add adjacent `Proof:` comments.

## 3. Generalize Fast placement and analysis

- [ ] 3.1 Add failing tests where a longer FF successor starts before its predecessor, where resources constrain actual placement, and where replay/float/critical path use negative weighted edges.
- [ ] 3.2 Replace chronological person-queue assumptions, rebuild resource-order evidence from placements, and generalize latest-date/float/replay. Keep Fast deadline misses distinct from proven infeasibility and timeout unknown.
- [ ] 3.3 Inject clamped FF weight or chronological replay; watch golden/float tests fail, restore and add adjacent `Proof:` comments.

## 4. Show relationship types

- [ ] 4.1 Add failing picker, card, accessibility and Gantt geometry cases for SS/FF, one-click FS default, actual zero-time anchors and collapsed type/scope grouping.
- [ ] 4.2 Enable the type selector, chip/card labels, SS left→left and FF right→right routes and cross-surface highlight.
- [ ] 4.3 Inject an FF arrow attached to a placeholder or an SS arrow attached to finishes; watch geometry tests fail, restore and add adjacent `Proof:` comments.

## 5. Verify

- [ ] 5.1 Run focused command/import/snapshot, Fast/solver, browser, format, lint, typecheck, build, OpenSpec validation and applicable host gate; record exact commands, results and R5 observations in verify.md.
