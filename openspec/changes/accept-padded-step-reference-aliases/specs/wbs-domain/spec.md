## ADDED Requirements

### Requirement: Padded ordinal step-reference aliases resolve

The step-reference resolver SHALL accept an ordinal alias with one or more leading zeroes when its positive ordinal and immutable step code name the same step in the current project address space. It SHALL continue accepting the unpadded alias and code-only reference, and SHALL return the existing code-only canonical reference. Zero, out-of-range ordinals, unsafe integers and mismatched ordinal/code pairs SHALL remain refused. The address revision requirement SHALL remain in force.

#### Scenario: A padded alias resolves to the same node

- **GIVEN** a leaf numbered `010` and the second project step has code `impl`
- **WHEN** `010.s02-impl` is resolved at the current address revision
- **THEN** it returns that step node ID and canonical reference `010.impl`

#### Scenario: A padded ordinal cannot hide a mismatch

- **GIVEN** the second project step has code `impl` and the first has code `plan`
- **WHEN** `010.s02-plan` is resolved at the current address revision
- **THEN** it is refused as `alias_mismatch` and resolves no node

#### Scenario: Zero remains invalid

- **WHEN** `010.s00-impl` is resolved
- **THEN** it is refused as malformed and resolves no node
