## Why

FS cannot express start or finish coordination without unnecessary delay. FF exposes a gap between fractional Fast time and integer CP-SAT time.

## What Changes

- Add start-to-start (SS) and finish-to-finish (FF) to typed dependency commands, picker, chips and Gantt arrows.
- Generalize Fast and CP-SAT to weighted start constraints, including valid negative FF weights, while preserving resource, floor and deadline rules.
- Protect real FF finish ordering under Q=48 quantization with `W_FF = max(D_a − D_b, ceil(Q × (d_a − d_b)))`; recompute it independently and validate materialized results.

## Non-Goals

No lag, start-to-finish relationships, split work, cycles or simultaneous-start/finish guarantees.

## Constraints

Archive `add-step-finish-start-dependencies` first, so the named MODIFIED requirements in this packet exist in the main specs. This change depends on that stage: it uses that change's endpoint model, typed table, commands, import and snapshot formats, graph expansion and FS UI. With paths relative to `openspec/changes/`, its exact MODIFIED bases are `Dependencies constrain scheduled slices` and `Explicit dependencies are editable from the table and chart` (`add-step-finish-start-dependencies/specs/wbs-domain/spec.md:3,55`), `Solver edges represent the expanded authored graph` (`add-step-finish-start-dependencies/specs/scheduler-optimization/spec.md:3`), `Typed dependencies have distinct undoable commands` (`add-step-finish-start-dependencies/specs/plan-command-registry/spec.md:3`), `Plan transfer preserves typed and legacy dependencies` (`add-step-finish-start-dependencies/specs/plan-import/spec.md:3`), `Working plans expose committed typed dependency mutations` (`add-step-finish-start-dependencies/specs/live-plan-snapshot/spec.md:3`), and `Saved plans retain typed dependency history` (`add-step-finish-start-dependencies/specs/saved-plans/spec.md:3`). Unknown slices remain zero schedule duration while their placeholders remain visible. A Fast deadline miss is not proof of infeasibility, and a solver timeout without a solution is unknown.

## Capabilities

### Modified Capabilities

- wbs-domain: SS/FF relationship semantics, validation and presentation.
- plan-command-registry: SS/FF typed commands and history.
- plan-import: versioned type preservation.
- live-plan-snapshot: working-plan visibility for SS/FF mutations.
- saved-plans: historical SS/FF read/display fidelity.
- deployment-pipeline: compatible-reader rollout and code rollback refusal.
- scheduler-optimization: weighted bounds, quantization, replay, float and output validation.

## Domain Terms

Relationship type is defined in `CONTEXT.md`.

## Decisions Recorded

SS and FF are lower-bound inequalities. FF uses the stronger quantized start bound in `design.md`; the executable CP-SAT model probe is design evidence, not an R5 production-path proof.

## Impact

Compatible SS/FF readers must precede SS/FF writes, and code rollback to an FS-only binary must refuse while SS/FF rows exist. Stage A's additive migration pair is expected to support SS/FF. This stage changes scheduler contracts, Fast analysis, UI and tests.
