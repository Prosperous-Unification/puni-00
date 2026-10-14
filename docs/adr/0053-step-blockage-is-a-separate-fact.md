# A step blockage is separate from step progress

A step's progress remains `in_progress` or `done`, with unknown represented by absence. A separate audited blockage fact records that one step is stopped by an external impediment. This avoids conflating progress, work-item readiness and work-item holds, and lets blockage stay schedule-neutral. Per-step `on_hold` is a separate decision because it requires removing individual nodes from schedule inputs and resolving the affected dependency graph.

We choose an additive satellite fact over widening the progress vocabulary or storing derived node status. If this boundary proves wrong, the cost is a later migration and reader transition to consolidate blockage into a broader node-lifecycle model.
