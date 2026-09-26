## ADDED Requirements

### Requirement: Kind resolution reads a candidate-held kind inventory

When the rule policy names a kind inventory, Twilight Burokrat SHALL read it from the selected candidate's blob and SHALL give each listed `delivery`, `feature`, `resource` or `repository` file that kind for MOD-LAYOUT, F1 and K2 through K6. A `support` entry SHALL be recorded and never judged. An inventory that is absent from the candidate, malformed, fails its schema, lists a path twice, lists a path that is not a regular file in the candidate, or classifies a suffix-declared file or a composition root SHALL leave every rule that reads kinds unevaluated. Without a named inventory, kinds SHALL come from suffixes and `view` directories alone.

#### Scenario: An inventory-declared resource is judged

- **GIVEN** an unsuffixed file the inventory calls a resource, and a delivery file that imports it
- **WHEN** K2 is checked
- **THEN** the verdict names the delivery file's import as a K2 finding

#### Scenario: The selected revision's inventory governs

- **GIVEN** a committed inventory and a different, uncommitted inventory in the checkout
- **WHEN** the committed candidate is checked
- **THEN** kinds come from the committed inventory

#### Scenario: A support entry is not judged

- **GIVEN** an unsuffixed file the inventory calls support, imported by a delivery file
- **WHEN** K2 is checked
- **THEN** the verdict has no finding and no unevaluated rule

#### Scenario: An unusable inventory is not evaluated

- **GIVEN** a named inventory that is absent, malformed, duplicated, stale or contradicts a suffix
- **WHEN** F1, K2, K6 or MOD-LAYOUT is checked
- **THEN** the rule is unevaluated with the inventory's reason and the verdict is not allowed
