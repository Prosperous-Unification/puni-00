## Why

FS alone cannot express “start once another step starts” or “finish no earlier than another step finishes.” Modeling those as FS would delay work unnecessarily. FF also exposes a rounding gap between fractional Fast time and integer CP-SAT time.

## What Changes

- Add start-to-start (SS) and finish-to-finish (FF) to typed dependency commands, picker, chips and Gantt arrows.
- Generalize Fast and CP-SAT to weighted start constraints, including valid negative FF weights, while preserving resource, floor and deadline rules.
- Protect real FF finish ordering under Q=48 quantization with `W_FF = max(D_a − D_b, ceil(Q × (d_a − d_b)))`; recompute it independently and validate materialized results.

## Non-Goals

No lag, start-to-finish relationships, split work, cycles or simultaneous-start/finish guarantees.

## Constraints

This change depends on `add-step-finish-start-dependencies`: it uses that change's endpoint model, typed table, commands, import and snapshot formats, graph expansion and FS UI. Unknown slices remain zero schedule duration while their placeholders remain visible. A Fast deadline miss is not proof of infeasibility, and a solver timeout without a solution is unknown.

## Capabilities

### Modified Capabilities

- wbs-domain: SS/FF relationship semantics, validation and presentation.
- plan-command-registry: SS/FF typed commands and history.
- plan-import: versioned type preservation.
- live-plan-snapshot: SS/FF snapshot fidelity.
- scheduler-optimization: weighted bounds, quantization, replay, float and output validation.

## Domain Terms

Relationship type is defined in `CONTEXT.md`.

## Decisions Recorded

SS and FF are lower-bound inequalities. FF uses the stronger quantized start bound in `design.md`; the executable CP-SAT model probe is design evidence, not an R5 production-path proof.

## Impact

No second table or migration is expected after Stage A's additive `migration.sql`/`down.sql` pair; the stored type field and uniqueness key already admit SS/FF. This stage changes scheduler wire/schema, cache contract, validators, Fast replay and float, frontend editor/arrows, and focused tests.
