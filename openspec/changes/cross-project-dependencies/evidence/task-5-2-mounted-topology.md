# Task 5.2 bounded mounted topology acceptance

The separate `cross-project-topology-events.controller.db.test.ts` suite exercises
composed HTTP commands, the production command runner and captures, migrated SQLite,
durable event streams, and the production broadcaster with a stub gateway response.
It deliberately uses the harness's synthetic authoring installation and trusted
storage fixture; this is not production activation evidence.

A stored A→B→C component is replaced with D→B→C by updating the incoming
relationship through B's mounted command route. Shared people remain disabled.
The exact recipient/cause set contains ten unique pairs: each old and new
three-project component independently, with shared pairs deduplicated. A and D
never receive each other's cause. All affected durable stream sequence numbers
advance past their pre-command heads, with monotonic sequence numbers per stream.
Project revisions remain unchanged; durable event sequences represent this refresh.
The retained relationship and a separate foreign organization's relationship are
byte-for-byte preserved. Unrelated and foreign projects receive no invalidation,
and the events contain no foreign labels.

The same topology replacement followed by a missing-row edit returns 404. Complete
rows of `external_dependency`, `work_item`, `project`, `command_journal`,
`plan_event`, `event_log`, and `event_sequencer` remain equal to their pre-batch
snapshots, and the gateway transport call count does not increase.

## Watched production faults

For each fault, the command was:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-topology-events.controller.db.test.ts --timeout=10000
```

The existing production function `compareDependencyFanout` was temporarily changed
in the isolated clone, then restored from the exact original before the next run:

| Fault                                                                       | Observed failure                                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Replace `for (const graph of [before, after])` with `[after]`               | Exact pair assertion failed: four missing old-component pairs; 0 pass, 1 fail, exit 1. |
| Replace the same traversal with `[before]`                                  | Exact pair assertion failed: four missing new-component pairs; 0 pass, 1 fail, exit 1. |
| Traverse the concatenation of before/after connection arrays for each graph | Exact pair assertion failed: two invented A↔D pairs; 0 pass, 1 fail, exit 1.           |

The observed logs are preserved as
[omitted old](task-5-topology-proofs/topology-without-old.log),
[omitted new](task-5-topology-proofs/topology-without-new.log), and
[mixed topology](task-5-topology-proofs/topology-mixed.log). Each records the
intended exact-pair assertion failure; the independent reviewer inspected all
three without re-injecting the faults.
The assertion's adjacent `Proof:` comment records these observations. No production
change was needed.

## Verification and limits

- `bun test apps/wbs/be-01/src/controller/cross-project-topology-events.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts --timeout=10000`: 9 pass, 0 fail, 135 assertions, exit 0 (`/tmp/topology-green.log`).
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json`: exit 0 with empty output (`/tmp/topology-typecheck.log`). An initial run caught a test Map key inference mismatch; explicit `Map<string, number>` fixed it before the successful rerun.
- Initial focused ESLint exited 0 but explicitly skipped the Nx module-boundary rule because no graph cache existed. Initial default `nx graph` exited 0 while reporting sandbox socket refusal and produced no graph: that exit was not accepted as graph evidence.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/topology-graph.json`: exit 0, produced the requested JSON and project graph cache. `bunx eslint apps/wbs/be-01/src/controller/cross-project-topology-events.controller.db.test.ts` then exited 0 with empty output (`/tmp/topology-eslint.log`), including the module-boundary rule.

`bunx prettier --check` on both changed files and `git diff --check` exited 0.

This bounded packet does not close task 5.2. It does not certify every
calendar/capacity/engine edit trigger, real gateway socket delivery, browser
subscription refresh, activation safety, or the canonical isolated host gate.
The sibling number-label packet is independent and edits the existing event suite;
this packet adds a separate suite to avoid overlap.

Independent Astra High review approved this test-only packet without a Critical
or Important finding and freshly reran 9/9 with 135 assertions. On the
integrated branch, the topology, number-label and committed-fanout suites pass
18/18 with 160 assertions; changed-file ESLint and Prettier pass. This test
compares allowed stream subscriptions and their advancing sequences but does
not yet bind each event payload's `projectId` to its actual stream subscription.
