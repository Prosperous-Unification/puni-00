# Task 5.2: number-only label invalidation

The mounted `cross-project-events.controller.db.test.ts` case unfreezes an
upstream `090` number to `010` through the composed HTTP command. A downstream
qualified reference changes from `UPS.090` to `UPS.010`; both downstream and
transitive tail receive exactly one `elsewhere_changed` event each. The
relationship rows are unchanged, and a foreign project receives
no event. Production code is unchanged.

The watched production fault replaced `for (const edge of graph.connections)`
inside `compareDependencyFanout` with a traversal over
`graph.connections.slice(0, 0)`. The selected mounted test exited 1 at its
successor event assertion (received `[]` instead of the event). Its
[negative log](incident-traversal-red.log) identifies the fault, command and
exit. Restoring the source passed the same test, 1/1 with 14 assertions
([restored log](incident-traversal-restored.log)). The author also ran the two
focused fanout suites 17/17 and full backend ESLint and configured typecheck.
Independent Astra High review reran the 17 cases with 131 assertions and found
no Critical or Important issue; the reviewer did not rerun the mutation itself.

This closes only the traversal proof for this bounded number-label case. The
topology-change and other cause sweeps, before-commit and organization-filter
faults, gateway/browser delivery, exact-SHA host gate and CI remain open.
