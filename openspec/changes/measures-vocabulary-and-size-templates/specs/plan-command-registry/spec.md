## ADDED Requirements

### Requirement: setMeasure takes points and applySizeTemplate is one new kind

`setMeasure` and `clearMeasure` SHALL accept `metric: 'points_estimate'`; `setMeasure` SHALL
refuse a non-integer or negative points value `422 points_not_integer` at its command index.
A new `applySizeTemplate` command SHALL address one step node (pair or step node ID) and name
a `templateId`; it SHALL expand inside the transaction to the estimate write and, when the
template row carries one, the token-estimate write, journalled as one entry with the history
sentence `applied size <name> to <reference>`. The registry's kind count SHALL move by exactly
one. The derived MCP tool SHALL carry the same fields and refusals.

#### Scenario: one undo takes a size back off

- **GIVEN** `010.dev` holding `1 / 2 / 3` and no token estimate
- **WHEN** a batch applies `M` (`2 / 3 / 5`, `40000` tokens) and the actor undoes once
- **THEN** `010.dev` reads `1 / 2 / 3` and no token estimate

#### Scenario: the kind count moves by one

- **GIVEN** the plan command registry after this change
- **WHEN** its kinds are counted
- **THEN** the count is the count before it plus one

#### Scenario: an unknown template rolls the batch back

- **GIVEN** a batch that first sets an estimate and then applies a template id nobody holds
- **WHEN** it is submitted
- **THEN** it is refused `404 unknown_template` at index 1 and the estimate is absent
