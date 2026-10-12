## ADDED Requirements

### Requirement: Canonical step references sort in displayed step order

The canonical reference of a coded step node SHALL spell the effective work-item number, a dot, `s`, the step's one-based displayed ordinal padded to the decimal width of the project's step count, a hyphen and its immutable step code. Within one work item, ordinary lexicographic sorting of canonical references SHALL match displayed project step order, including when the step count crosses from nine to ten. A step reorder or repadding SHALL change readable references and the address revision but SHALL NOT change step-node IDs or copied node-ID links. The resolver SHALL continue accepting code-only and unpadded ordinal references at the current address revision and SHALL return the new canonical spelling. An uncoded step SHALL continue to have no readable reference.

#### Scenario: Three steps keep their displayed order

- **GIVEN** leaf `010` and project steps Plan, Impl and Review with codes `plan`, `impl` and `review` in that order
- **WHEN** its step nodes are read, resolved or copied from their open cells
- **THEN** their canonical references are `010.s1-plan`, `010.s2-impl` and `010.s3-review`

#### Scenario: The tenth step repads references

- **GIVEN** leaf `010` and nine project steps
- **WHEN** a tenth step is added
- **THEN** the first and tenth canonical references spell `010.s01-<code>` and `010.s10-<code>`, and sorting all ten strings lexicographically yields displayed step order

#### Scenario: Reorder changes spelling but preserves identity

- **GIVEN** a leaf step node has a stable step-node ID and a copied link
- **WHEN** its project step moves from position two to position three
- **THEN** its canonical reference and address revision change, and its step-node ID and copied link keep naming the same node

#### Scenario: Legacy input resolves to the new spelling

- **GIVEN** coded step Impl is second in a project of twelve steps and leaf `010` exists
- **WHEN** `010.impl`, `010.s2-impl` or `010.s02-impl` is resolved at the current address revision
- **THEN** each resolves to the same step-node ID and returns `010.s02-impl`
