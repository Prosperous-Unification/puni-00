## Part 1: OpenSpec change, rule model, registry, and static explain

- [x] Add the OpenSpec artifacts and validate them.
- [x] Add `rules.test.ts`; observe both static `explain` tests fail before implementation and pass afterward.
- [x] Add the rule model, four-rule registry, shared candidate blob reader, and static `explain` command.
- [x] Inject P1 by bypassing the unknown-rule refusal; observe the unregistered-rule test fail, restore, and rerun it green.
- [x] Run the focused rule and moved-reader suites, typecheck, source lint, and OpenSpec validation.

## Part 2: Trusted policy boundary and check

- [x] Add eleven policy-boundary, `check`, and policy-aware `explain` tests; observe them fail before implementation and all thirteen rule tests pass afterward.
- [x] Add external policy loading, complete mode validation, candidate-root containment, verdict construction, and the `check` route.
- [x] Inject and observe P2 through P12 plus P20 and P21 against their named focused tests, restoring and rerunning after each fault.
- [x] Run the focused rule, candidate-reader, and trusted-policy suites, typecheck, source lint, and OpenSpec validation.

## Part 3: Failure classification and adapter proofs

- [x] Add six real-candidate adapter tests and observe all nineteen rule tests pass without new implementation.
- [x] Inject and observe P13 through P19 plus P22 against their named adapter tests, restoring and rerunning after each fault.
- [x] Run the focused rule, relationship, and index suites, typecheck, source lint, and OpenSpec validation.

## Part 4: Built executable, documentation, and record

- [x] Extend the package build test with installed `explain`, allowed `check`, and refused `check` coverage.
- [x] Document the rule commands, non-certifying verdict, external policy boundary, unevaluated behavior, and `twib` alias.
- [x] Record every command result and P1 through P19 in `verify.md`.
- [x] Run the combined rule and packaging suites, typecheck, source lint, build, owned-file formatting, repository format check, and OpenSpec validation.
