# Shared INITIAL graph validation prerequisite

The original handoff producer needs to validate its intended byte graph before exposure and inspect actual parked raw artifacts before activation DML. The current graph entry requires already published terminal state, so it cannot provide these checks at their required points without fabricated state.

Add an internal content-only plan validator and a bounded raw-artifact observer in the existing graph module. Reuse its existing codecs and crosslink checks once. Preserve the actual H6–H8 reader, solver caller, deadlines, file accounting, dedicated ready reread, phase matrix and archive/absence evidence. A plan is supplied consistency evidence; validation returns no authority. The raw observer retains its own descriptor and byte baselines and proves no SQLite effect.

Limit implementation to the graph module, its owning test and the existing explicitly seeded fixture. The fixture gains a plan-only mode without publishing terminal state. Keep edge-policy and all owner/production callers unchanged. Bound external strings and rosters before work, detach retained inputs, define close behavior and check the original deadline before success.

Full producer integration, bounded storage wiring before DML, sequence reservation, genuine continuation/custody, terminal operations, selected successors, R5 qualification, native capacity, full gates, main adoption and deployment remain required separate work. This prerequisite does not complete OH1–OH4.
