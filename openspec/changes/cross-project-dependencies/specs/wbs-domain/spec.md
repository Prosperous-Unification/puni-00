## MODIFIED Requirements

### Requirement: Authored dependencies form an acyclic step-node graph

The system SHALL validate the resolved step-node graph, including workflow and legacy edges, before accepting typed or legacy dependency creation, update or removal; reparenting, step insertion, deletion or reordering; project `depReach` changes; estimate edits that move a dynamic legacy anchor; or undo/redo and batch replay. All relevant writes SHALL validate the combined graph atomically against their resulting tree, step order, estimates and links. A refusal SHALL preserve all earlier state. It SHALL reject directed cycles, self-node pairs and any selector expansion producing one, without silently omitting pairs. A valid step-node DAG SHALL NOT be refused merely because work-item or project IDs appear cyclic. Validation SHALL cover all incident cross-project dependencies together with their project-local workflow and legacy edges. Deleting a step referenced by a node or descendant-step endpoint SHALL be refused until its typed dependencies are removed or reassigned. When a leaf with node endpoints gains its first child, those endpoints SHALL move with the hand-down's step node mapping in the same transaction. Deleting an externally referenced predecessor SHALL refuse until its external relationships are removed or reassigned. Other work-item deletion SHALL remove, in the same undoable entry, its local typed relationships and successor-owned incoming external relationships whose endpoints lie in the deleted subtree; hand-up of facts SHALL carry no endpoints. A move or deletion that would leave a descendant-step endpoint naming a leaf SHALL be refused naming the affected dependencies. No structural edit SHALL broaden or narrow an endpoint's scope.

#### Scenario: Apparent work-item cycle is a valid step-node DAG

- **GIVEN** `A.dev` → `B.dev` and `B.qa` → `A.qa` with Dev then QA inside each item
- **WHEN** the second edge is validated
- **THEN** it is accepted if the resolved step-node graph is acyclic

#### Scenario: Parent expansion introduces a self-node pair

- **GIVEN** a proposed parent endpoint whose descendant expansion includes the successor step node
- **WHEN** the dependency is submitted
- **THEN** the entire write is refused with a modeled conflict and no edge is stored

#### Scenario: An estimate edit moves a legacy anchor into a cycle

- **GIVEN** typed `A.qa` → `B.qa` and legacy B → A with `anchor-slice` reach currently anchored at B.Dev
- **WHEN** B.Dev's estimate is cleared so B.QA becomes the legacy anchor
- **THEN** the combined-graph cycle is refused atomically and the estimate and anchor stay unchanged

#### Scenario: Changing dependency reach closes a cycle

- **GIVEN** typed `A.qa` → `B.qa` and legacy B → A with `anchor-slice` reach anchored at B.Dev
- **WHEN** a mounted project update changes `depReach` to `whole-item`
- **THEN** the resulting combined-graph cycle is refused atomically and `depReach` and links stay unchanged

#### Scenario: A legacy write bypasses a typed edge

- **GIVEN** an existing typed edge in a valid step-node DAG
- **WHEN** a mounted legacy `addDependency` or history replay would close a cycle
- **THEN** it is refused with no partial dependency or history write

#### Scenario: A descendant-step parent cannot silently become a leaf

- **GIVEN** descendant-step 020 Dev → node `030.dev` and 020 has one child
- **WHEN** that child is deleted
- **THEN** the deletion is refused naming the relationship and nothing is written

#### Scenario: A node endpoint follows hand-down

- **GIVEN** a typed dependency on node `010.dev`
- **WHEN** 010 gains its first child 010.1
- **THEN** the dependency names node `010.1.dev` and undo restores `010.dev`

#### Scenario: Returning to a project is not a cycle

- **GIVEN** A.Design → B.Build → A.Test is a resolved step-node DAG
- **WHEN** its external links or an otherwise valid project priority edit are submitted
- **THEN** they are accepted without requiring the project-level connections to be acyclic

## ADDED Requirements

### Requirement: Dependency endpoints resolve against their owning project's steps

A typed dependency SHALL resolve endpoints in the same project or in readable projects of the same organization. Each endpoint SHALL resolve against its owning project's tree and configured step definitions, using the declared endpoint scope and applicable work-item or node identity. Equal step labels or IDs in different projects SHALL NOT substitute the successor project's steps for the predecessor project's steps.

#### Scenario: External nodes use their own project steps

- **GIVEN** two projects have different step catalogs
- **WHEN** a typed dependency is resolved between their nodes
- **THEN** each endpoint uses its own project catalog and its FS, SS or FF boundary is enforced across the connected graph

### Requirement: External dependency selection binds project-qualified endpoints

The dependency picker SHALL present authorized external endpoints with project-qualified addresses and visible project, work-item and applicable step identity. Selecting an external endpoint SHALL bind its stable identity from its own project. Automatic same-step preselection SHALL require a matching step ID within the same project. An absent or unavailable step SHALL remain unavailable until an explicit valid choice is made.

#### Scenario: External selection uses project-qualified addresses

- **GIVEN** a dependency picker opened from a row or step cell
- **WHEN** the user selects a predecessor from another project
- **THEN** the endpoint editor reads that project's own steps and the chip uses its qualified address
- **AND** no project-level cycle refusal replaces resolved task/step graph validation
