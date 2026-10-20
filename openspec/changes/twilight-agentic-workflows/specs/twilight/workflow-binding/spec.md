## ADDED Requirements

### Requirement: A validated binding names the activity for a step

A repository SHALL hold one workflow binding, `.twilight/workflows.yaml`, that maps work item
type and step code to an activity class with an executor kind and its pinned settings.
Twilight Burokrat SHALL validate it without a clock, network or credentials, given the step
codes the project holds, and SHALL refuse an unknown executor kind, a model id without a
provider prefix, a prompt file that is absent, a step code the project does not hold, and a
version it does not know. Twilight Dash SHALL run only a binding Burokrat accepted at the
same revision.

#### Scenario: A complete binding is accepted

- **WHEN** `twib validate workflow-binding .twilight/workflows.yaml --steps plan,impl,review,verify,integrate`
  runs on a binding naming those codes with pinned models and present prompts
- **THEN** it prints the binding digest and exits 0

#### Scenario: A step code the project lacks is refused

- **WHEN** the binding maps `change.qa` and the project's step codes are `plan,impl,review`
- **THEN** validation exits non-zero naming `qa` as unknown to the project

#### Scenario: An unpinned model is refused

- **WHEN** a class names `model: gpt-6-sol`
- **THEN** validation exits non-zero and names the `provider:model` form

#### Scenario: Dash refuses an unvalidated binding

- **WHEN** `run-coordinator` is given a binding whose digest does not match the accepted one
  recorded for the revision
- **THEN** it refuses to admit any attempt and names both digests
