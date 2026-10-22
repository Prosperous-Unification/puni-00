# Saved connected history codec: slice 1

Base: `cca86df06da8e5afd4b0656d61887872ce3fcdbd`. Implementation is isolated in
`/tmp/puni-history-codec`. This slice adds pure historical types/readers only.
Input v8 and schedule v1 writers/readers are untouched. No writer version is activated.
Task 8.3 remains open until production save/read/compare integration and its gate.

The historical `connected-stage-v1` schema freezes the canonical stage JSON shape;
it does not import the live stage decoder, canonicalizer, solver port or scheduler.
The sole schedule import is a TypeScript type for explicit Map encoding. Selected
publication decisions carry their captured baseline and selected schedules, avoiding
floating-point finish reconstruction or present-day scheduling during inspection.
Stage execution order and stage byte strings remain unchanged.

## Red, green and provisional fault observations

Command: `bun test libs/wbs/domain/domain/src/saved-plan/connected-history.test.ts`.
Initial red: missing `dependency-history` module, 0 pass / 1 fail. After implementation,
29 tests / 43 assertions pass. Subsequent targeted red tests exposed an unchecked later
stage boundary, a simultaneously omitted graph node/readiness entry, and a forged
unreduced stage selector; their implementations restored green.

Each fault below was injected individually, its named test was watched failing, and
the original implementation was restored in a `finally` block. The complete suite
then passed again: 29 pass / 0 fail / 43 assertions.

| Injected fault                                       | Observed test                                               | Observation                                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Omit endpoint lookup condition                       | `names the missing endpoint lookup boundary`                | Expected `endpoint_lookup`, received `row.name` TypeError. Diagnostic-only: downstream label access still refuses the record. |
| Omit question/stage byte equality                    | `refuses candidate question mismatching its captured stage` | Mismatched stage question was accepted; expected throw absent.                                                                |
| Feed Schedule.slices Map directly into JSON boundary | `explicit map encoding retains every slice and work item`   | `json_required` exception replaces successful retained slice encoding.                                                        |
| Skip dependency decoder detachment                   | `detaches nested caller mutations`                          | Caller project rename rewrote the later serialized history bytes.                                                             |

These are **codec-only provisional negatives**, not R5 production-path proofs. No
`Proof:` comment claims save/read protection. Slices 3 and 4 must wire these boundaries
and repeat faults through actual persisted save/read paths before making that claim.

The scheduler-isolation test runs a fresh Bun subprocess with the live schedule module
mocked to throw on import, then imports and runs both historical readers and cross-body
validation. This checks the actual reader import graph; it is not a source-text scan.

## Verification and limits

Baseline: canonical input tests, 12 pass / 0 fail. Focused codec checks and scoped Nx
lint/typecheck and OpenSpec validation are rerun before commit; their final outcomes
are reported with the commit. Normal lefthook hooks are installed and used.

No full h2/h4 gate, full workspace build, deployment, optimizer admission, database
save/read integration or production activation is performed in this pure codec slice.
The integrator owns the final gate and task completion.

Final local verification (2026-10-22):

- The six explicit saved-plan test files (`canonical-plan-input`, `normalise-plan-input`,
  `diff-plans`, `step-blockages`, `step-parallels`, `connected-history`): 145 pass,
  0 fail, 462 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:typecheck`:
  succeeded, 0/1 cache hits.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:lint`:
  succeeded, 0/1 cache hits.
- `bunx openspec validate --all --json`: 268 passed, 0 failed (250 changes, 18 specs).
- `git diff --check`: passed.

An intermediate directory-filter invocation, `bun test libs/wbs/domain/domain/src/saved-plan`,
collected the typecheck-emitted `dist/out-tsc` copies as well as source tests and reported
318 pass / 1 fail: the emitted scheduler-poison test tried to import nonexistent sibling
`.ts` files from `dist`. The required explicit-source-file commands above avoid that
unintended generated-test collection and pass. No generated output is committed.

## Astra review corrections

Followup to `999cdca8aaf4ed720f7ef159dfcea65f061642da`, still pure codec scope.
Nine focused tests first reproduced the review findings (0 pass / 9 fail):

- Enabled Fast may retain validated observations and publication decisions while
  selecting none; disabled optimized may have no observation. Historical validation
  now separates observation from selection, matching `selectConnectedOptimizations`.
  Cross-body enablement checks reject disabled observations and missing required
  enabled optimized observations. Fast never selects an observed ready candidate.
- Each canonical node's identity must have its actual slice-group position; complete
  but separately permuted identity/position sets no longer pass.
- Each authored graph edge endpoint's captured owner must match that relationship's
  corresponding selector project. Predecessor and successor checks are independent.
- Work-item earliest/latest intervals are validated in baseline, composite and both
  decision placements, in addition to the existing slice interval checks.

Eight individual codec mutations were watched failing and restored:

| Fault                                         | Named test/filter                                                | Observed failures |
| --------------------------------------------- | ---------------------------------------------------------------- | ----------------- |
| Restore engine/observation coupling           | `retains .* without selecting observed candidates`               | 2                 |
| Bypass node identity/position equality        | `refuses swapped stage step identities`                          | 1                 |
| Bypass predecessor owner equality             | `refuses authored stage edge with foreign predecessor ownership` | 1                 |
| Bypass successor owner equality               | `refuses authored stage edge with foreign successor ownership`   | 1                 |
| Bypass work-item earliest interval comparison | `refuses reversed work-item intervals`                           | 4                 |
| Bypass work-item latest interval comparison   | `refuses reversed work-item intervals`                           | 4                 |
| Bypass captured enablement check              | `refuses inconsistent stage enablement`                          | 2                 |
| Bypass selected-objective check               | `Fast cannot select an observed ready objective`                 | 1                 |

Restoration command: `bun test libs/wbs/domain/domain/src/saved-plan/connected-history.test.ts`:
41 pass / 0 fail / 63 assertions. These remain provisional codec negatives; no
production-path R5 proof or completion of task 8.3 is claimed.

Followup final verification (2026-10-22): six explicit source saved-plan files pass
157 tests / 0 failures / 482 assertions. Scoped `wbs-domain:typecheck` and
`wbs-domain:lint` Nx targets pass with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`,
0/1 cache hits each. `bunx openspec validate --all --json` passes all 268 items
(250 changes, 18 specs). Prettier and `git diff --check` pass. Normal hooks are used.
Full host gate and production save/read integration remain unrun in this codec slice.
