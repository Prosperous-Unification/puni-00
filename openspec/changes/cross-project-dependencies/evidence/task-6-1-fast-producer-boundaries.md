# Task 6.1 bounded Fast producer boundary acceptance

Recorded 2026-10-23 against `2af130d53` in isolated clone
`/tmp/puni-fast-boundaries-61`. This packet adds domain acceptance tests only;
production scheduling is unchanged. Parent 6.1 remains open for the full matrix.

The four `Fast producer retains ...` cases in
`libs/wbs/domain/domain/src/schedule-connected.test.ts` invoke the actual
`scheduleResolved` Fast producer with connected ownership/rank metadata and a
resolved authored edge. The successor has project rank zero and priority one;
the predecessor has project rank one and priority 99. Neither slice reserves a
person or pool, so occupancy cannot accidentally impose the tested boundary.
The predecessor has an explicit start floor, distinguishing delayed SS from a
missing relationship. Unequal FF durations cover positive and negative weights.
Each case asserts the returned start and the exact materialized boundary equality.

| Type | Predecessor floor | Predecessor duration | Successor duration | Expected successor start |
| ---- | ----------------: | -------------------: | -----------------: | -----------------------: |
| FS   |                 1 |                  0.3 |                0.7 |                      1.3 |
| SS   |                 2 |                    3 |                0.5 |                        2 |
| FF   |                 2 |                  0.7 |                0.3 |                      2.4 |
| FF   |                 2 |                  0.3 |                0.7 |                      1.6 |

## Watched production mutations

Every probe ran:

```sh
bun test libs/wbs/domain/domain/src/schedule-connected.test.ts --test-name-pattern 'Fast producer'
```

The omission probes replaced the actual producer's
`const resolvedEdges = input.graph.edges` in `schedule.ts` with
`input.graph.edges.filter((edge) => edge.type !== '<type>')`. They also bypassed
only the final `validateResolvedRealBoundaries(input, plan)` call to expose the
corrupted placement to the test assertions. This observation bypass alone passed
all four cases, providing the control. No validator comparison implementation
was mutated. The producer omission then failed the final start assertion,
independently for each relationship type.

The substitution probes mapped the selected producer edge type to FS using
`{ ...edge, type: 'FS' as const }`, retaining both the original input graph and
publication validator. These valid but unnecessarily late placements reached
and failed the final start assertions, demonstrating that the acceptance tests
also detect type substitution rather than relying only on rejection of early
placement.

| Probe                                              | Observed successor starts              | Test outcome   | Exit |
| -------------------------------------------------- | -------------------------------------- | -------------- | ---: |
| Publication-call bypass alone                      | unchanged                              | 4 pass, 0 fail |    0 |
| Producer omits FS, observation bypass              | 0 instead of 1.3                       | 3 pass, 1 fail |    1 |
| Producer omits SS, observation bypass              | 0 instead of 2                         | 3 pass, 1 fail |    1 |
| Producer omits FF, observation bypass              | 0 instead of 2.4 and 1.6               | 2 pass, 2 fail |    1 |
| Producer substitutes FS for SS, validation enabled | 5 instead of 2                         | 3 pass, 1 fail |    1 |
| Producer substitutes FS for FF, validation enabled | 2.7 instead of 2.4; 2.3 instead of 1.6 | 2 pass, 2 fail |    1 |

All faults were restored before regression verification. An adjacent `Proof:`
comment records the observed failures. `git diff -- schedule.ts` is empty.
Raw probe output and the restored focused run are retained in
[task-6-1-fast-producer-proofs](task-6-1-fast-producer-proofs/) under the names
`validator-bypass-control`, `fs-producer-edge-omitted`,
`ss-producer-edge-omitted`, `ff-producer-edge-omitted`,
`ss-producer-replaced-by-fs` and `ff-producer-replaced-by-fs`.

## Verification and limits

- `bun test libs/wbs/domain/domain/src/schedule-connected.test.ts`: 28 pass,
  zero fail; includes the four added producer cases.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:test --skip-nx-cache`:
  1,486 pass, one existing skip, zero fail, 63,332 assertions across 100 files.
  The skipped case is the real-plan 600-slice elapsed-time certification.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:lint --skip-nx-cache`:
  configured target executed successfully.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:typecheck --skip-nx-cache`:
  configured target executed successfully.
- The first Nx invocations without those environment settings printed socket
  permission errors and exited zero without executing targets. Those attempts
  provide no check evidence; the recorded retries explicitly executed targets.
- Formatting is checked on the changed test and this evidence file before commit.
- No mounted reader, project calendar, installed solver/image, release build,
  activation or canonical host gate is claimed by these domain tests. Those
  checks were not run in this bounded packet; integration remains the parent's
  responsibility. No production defect was observed or production fix added.

Independent Astra High review approved the bounded packet without a Critical
or Important finding. It reran the restored file 28/28 with 42 assertions and
inspected the saved mutation receipts; it did not re-inject them. On the
integrated branch, the producer, mounted Fast capacity and mounted calendar
suites passed 37/37 with 108 assertions. Scoped OpenSpec validation and
changed-file Prettier also passed.
