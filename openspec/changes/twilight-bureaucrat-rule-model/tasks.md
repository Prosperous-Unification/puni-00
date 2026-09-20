## Part 1: OpenSpec change, rule model, registry, and static explain

- [ ] Add the OpenSpec artifacts and validate them.
- [ ] Add `rules.test.ts`; observe both static `explain` tests fail before implementation and pass afterward.
- [ ] Add the rule model, four-rule registry, shared candidate blob reader, and static `explain` command.
- [ ] Inject P1 by bypassing the unknown-rule refusal; observe the unregistered-rule test fail, restore, and rerun it green.
- [ ] Run the focused rule and moved-reader suites, typecheck, source lint, and OpenSpec validation.

## Part 2: Trusted policy boundary and check

- [ ] Add the ten policy-boundary and `check` tests; observe them fail before implementation and all twelve rule tests pass afterward.
- [ ] Add external policy loading, complete mode validation, candidate-root containment, verdict construction, and the `check` route.
- [ ] Inject and observe P2 through P12 against their named focused tests, restoring and rerunning after each fault.
- [ ] Run the focused rule, candidate-reader, and trusted-policy suites, typecheck, and source lint.

## Part 3: Failure classification and adapter proofs

- [ ] Add five real-candidate adapter tests and observe all seventeen rule tests pass without new implementation.
- [ ] Inject and observe P13 through P19 against their named adapter tests, restoring and rerunning after each fault.
- [ ] Run the focused rule, relationship, and index suites, typecheck, and source lint.

## Part 4: Built executable, documentation, and record

- [ ] Extend the package build test with installed `explain`, allowed `check`, and refused `check` coverage.
- [ ] Document the rule commands, non-certifying verdict, external policy boundary, unevaluated behavior, and `twib` alias.
- [ ] Record every command result and P1 through P19 in `verify.md`.
- [ ] Run the combined rule and packaging suites, typecheck, source lint, build, owned-file formatting, repository format check, and OpenSpec validation.
