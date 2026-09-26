## ADDED Requirements

### Requirement: Dependencies constrain scheduled slices

Legacy dependencies SHALL continue to use the project's dynamic `depReach`, including `anchor-slice`, until explicitly edited. Typed FS dependencies SHALL name a predecessor and a successor endpoint, each `{ scope: whole, workItemId }`, `{ scope: node, stepNodeId }` or `{ scope: descendant-step, workItemId, stepId }`, and SHALL constrain each resolved predecessor step node's finish to no later than each resolved successor step node's start. A whole leaf predecessor SHALL resolve to its last step node and a whole leaf successor to its first. A whole parent SHALL resolve to every descendant leaf, and a descendant-step endpoint to that step's node in every descendant leaf; every resolved predecessor/successor pair SHALL be constrained. A node endpoint SHALL name a leaf's step node; a descendant-step endpoint SHALL name a parent. A project without steps SHALL offer only whole scope, resolved to each leaf's work-item boundary. Unknown step nodes SHALL remain zero-duration graph nodes, irrespective of their visual placeholder width. Resolved typed edges SHALL carry `authored` provenance and their relationship ID beside `workflow` and `legacy` edges.

#### Scenario: Dev handoff overlaps QA

- **GIVEN** A and B each have Dev then QA, with A.Dev estimated and A.QA still running
- **WHEN** an FS dependency from node `A.dev` to node `B.dev` is scheduled
- **THEN** B.Dev may start when A.Dev finishes, subject to other real constraints
- **AND** it does not wait for A.QA solely because of this dependency

#### Scenario: A node predecessor and a whole successor

- **GIVEN** A and B each have Dev then QA
- **WHEN** node `A.dev` → whole B FS is scheduled
- **THEN** B.Dev waits for A.Dev's finish and B.QA follows B.Dev through its workflow edge

#### Scenario: A whole predecessor and a node successor

- **GIVEN** A and B each have Dev then QA
- **WHEN** whole A → node `B.qa` FS is scheduled
- **THEN** B.QA waits for A.QA's finish and B.Dev may start earlier

#### Scenario: A parent endpoint selects every leaf

- **GIVEN** parent A has two leaf descendants and B has one
- **WHEN** Whole A to Whole B FS is added
- **THEN** B's first step node waits for both A leaves' last step nodes
- **AND** the picker explains “All descendant work items” with the affected count

#### Scenario: A descendant-step endpoint selects one step in every leaf

- **GIVEN** parent A has two leaves, each with Dev then QA
- **WHEN** descendant-step A Dev → node `B.dev` FS is added
- **THEN** B.Dev waits for both leaves' Dev nodes and not for their QA nodes

#### Scenario: Legacy anchor remains dynamic

- **GIVEN** an existing dependency under `anchor-slice` reach
- **WHEN** the project's steps or estimates change without editing that dependency
- **THEN** it follows the current anchor rule, rather than a pinned explicit endpoint

### Requirement: Authored dependencies form an acyclic step-node graph

The system SHALL validate the resolved step-node graph, including workflow and legacy edges, before accepting typed or legacy dependency creation, update or removal; reparenting, step insertion, deletion or reordering; estimate edits that move a dynamic legacy anchor; or undo/redo and batch replay. All relevant writes SHALL validate the combined graph atomically against their resulting tree, step order, estimates and links. A refusal SHALL preserve all earlier state. It SHALL reject directed cycles, self-node pairs and any selector expansion producing one, without silently omitting pairs. A valid step-node DAG SHALL NOT be refused merely because work-item IDs appear cyclic. Deleting a step referenced by a node or descendant-step endpoint SHALL be refused until its typed dependencies are removed or reassigned. When a leaf with node endpoints gains its first child, those endpoints SHALL move with the hand-down's step node mapping in the same transaction; when a structural edit leaves a node endpoint with no unambiguous replacement, the edit SHALL be refused naming the affected dependencies, and SHALL NOT broaden the endpoint to whole or descendant-step scope.

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

#### Scenario: A legacy write bypasses a typed edge

- **GIVEN** an existing typed edge in a valid step-node DAG
- **WHEN** a mounted legacy `addDependency` or history replay would close a cycle
- **THEN** it is refused with no partial dependency or history write

#### Scenario: A node endpoint follows hand-down

- **GIVEN** a typed dependency on node `010.dev`
- **WHEN** 010 gains its first child 010.1
- **THEN** the dependency names node `010.1.dev` and undo restores `010.dev`

### Requirement: Explicit dependencies are editable from the table and chart

The Depends on picker SHALL add Whole→Whole FS by clicking a search result after opening it. Opened from a leaf's step cell, it SHALL preselect the same step on both sides, resolved by step ID and replaced by any explicit choice; a predecessor lacking that step SHALL show the choice unavailable rather than substitute another. Its separate Customize action SHALL open endpoint editing without creating a dependency. Chips SHALL spell endpoints by step reference or work-item number, then type, then the successor's step code when not whole, e.g. `[010.dev FS → dev]` or `[010 FS]`; a descendant-step endpoint SHALL show its parent, step and leaf count and SHALL NOT be spelled as a single step reference. Chips SHALL expose full accessible labels naming both work items and steps. The editor SHALL preserve step order, explain parent expansion and show refusals. Keyboard and mobile users SHALL be able to create, inspect, edit and remove the same relationships without hover. Gantt FS arrows SHALL attach to the resolved step nodes' actual finish/start boundaries, highlight with their chips and cards, and summarize collapsed-parent relationships without misleading self-arrows.

#### Scenario: One-click default and separate customization

- **GIVEN** the dependency picker is open on B's row
- **WHEN** A's search result is clicked
- **THEN** one Whole A → Whole B FS dependency is committed
- **AND** activating A's `›` instead opens endpoint fields without a write

#### Scenario: Opening from a step cell preselects the same step

- **GIVEN** the dependency picker is opened from B's QA cell
- **WHEN** A is chosen in Customize
- **THEN** node `A.qa` → node `B.qa` FS is proposed and nothing is written until Save

#### Scenario: Unknown step node arrow uses scheduled time

- **GIVEN** an unestimated predecessor node with a two-day visual placeholder
- **WHEN** its FS arrow is drawn
- **THEN** the arrow starts at its zero-time scheduled finish tick
- **AND** the placeholder's right edge does not delay or anchor the relationship

#### Scenario: Collapsed relationships remain explainable

- **GIVEN** several leaf relationships under collapsed parents
- **WHEN** the Gantt is drawn
- **THEN** external connectors are grouped by visible ancestors, type and scope with a count
- **AND** internal relationships show an internal-dependencies count rather than a self-arrow
