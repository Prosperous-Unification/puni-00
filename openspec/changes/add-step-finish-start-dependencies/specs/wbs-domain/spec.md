## ADDED Requirements

### Requirement: Dependencies constrain scheduled slices

Legacy dependencies SHALL continue to use the project's dynamic `depReach`, including `anchor-slice`, until explicitly edited. Typed FS dependencies SHALL name predecessor and successor `{workItemId, scope: whole | step(stepId)}` endpoints and SHALL constrain each resolved predecessor slice finish no later than each resolved successor slice start. A leaf whole predecessor resolves to its last step and a leaf whole successor to its first; parent endpoints expand to every descendant leaf and every predecessor/successor leaf pair. A project without configured steps SHALL retain its synthetic slice and offer only whole scope. Unknown steps SHALL remain zero-duration dependency nodes, irrespective of their visual placeholder width.

#### Scenario: Dev handoff overlaps QA

- **GIVEN** A and B each have Dev then QA, with A.Dev estimated and A.QA still running
- **WHEN** an FS dependency from A.Dev to B.Dev is scheduled
- **THEN** B.Dev may start when A.Dev finishes, subject to other real constraints
- **AND** it does not wait for A.QA solely because of this dependency

#### Scenario: A parent endpoint selects every leaf

- **GIVEN** parent A has two leaf descendants and B has one
- **WHEN** Whole A to Whole B FS is added
- **THEN** B's first slice waits for both A leaves' last slices
- **AND** the picker explains “All descendant work items” with the affected count

#### Scenario: Legacy anchor remains dynamic

- **GIVEN** an existing dependency under `anchor-slice` reach
- **WHEN** the project's steps or estimates change without editing that dependency
- **THEN** it follows the current anchor rule, rather than a pinned explicit endpoint

### Requirement: Authored dependencies form an acyclic slice graph

The system SHALL validate the expanded authored graph, including internal step order and legacy edges, before accepting typed or legacy dependency creation, update or removal; reparenting, step insertion, deletion or reordering; estimate edits that move a dynamic legacy anchor; or undo/redo and batch replay. All relevant writes SHALL validate the combined graph atomically against their resulting tree, step order, estimates and links. A refusal SHALL preserve all earlier state. It SHALL reject directed cycles, self-slice pairs and any parent expansion producing one, without silently omitting pairs. Deleting a referenced step SHALL be refused until its typed dependencies are removed or reassigned. A valid slice DAG SHALL NOT be refused merely because work-item IDs appear cyclic.

#### Scenario: Apparent work-item cycle is a valid slice DAG

- **GIVEN** A.Dev → B.Dev and B.QA → A.QA with serial Dev then QA inside each item
- **WHEN** the second edge is validated
- **THEN** it is accepted if the expanded slice graph is acyclic

#### Scenario: Parent expansion introduces a self-slice

- **GIVEN** a proposed parent endpoint whose descendant expansion includes the successor slice
- **WHEN** the dependency is submitted
- **THEN** the entire write is refused with a modeled conflict and no edge is stored

#### Scenario: An estimate edit moves a legacy anchor into a cycle

- **GIVEN** typed A.QA → B.QA and legacy B → A with `anchor-slice` reach currently anchored at B.Dev
- **WHEN** B.Dev's estimate is cleared so B.QA becomes the legacy anchor
- **THEN** the combined-graph cycle is refused atomically and the estimate and anchor stay unchanged

#### Scenario: A legacy write bypasses a typed edge

- **GIVEN** an existing typed edge in a valid slice DAG
- **WHEN** a mounted legacy `addDependency` or history replay would close a cycle
- **THEN** it is refused with no partial dependency or history write

### Requirement: Explicit dependencies are editable from the table and chart

The Depends on picker SHALL add Whole→Whole FS by clicking a search result after opening it. Its separate Customize action SHALL open endpoint editing without creating a dependency. Chips SHALL display number, type and selected scopes, e.g. `[010 FS · Dev → Dev]`, and expose full accessible labels. The editor SHALL preserve step order, explain parent expansion and show refusals. Keyboard and mobile users SHALL be able to create, inspect, edit and remove the same relationships without hover. Gantt FS arrows SHALL attach to actual selected finish/start boundaries, highlight with their chips and cards, and summarize collapsed-parent relationships without misleading self-arrows.

#### Scenario: One-click default and separate customization

- **GIVEN** the dependency picker is open on B
- **WHEN** A's search result is clicked
- **THEN** one Whole A → Whole B FS dependency is committed
- **AND** activating A's `›` instead opens endpoint fields without a write

#### Scenario: Unknown slice arrow uses scheduled time

- **GIVEN** an unestimated predecessor with a two-day visual placeholder
- **WHEN** its FS arrow is drawn
- **THEN** the arrow starts at its zero-time scheduled finish tick
- **AND** the placeholder's right edge does not delay or anchor the relationship

#### Scenario: Collapsed relationships remain explainable

- **GIVEN** several leaf relationships under collapsed parents
- **WHEN** the Gantt is drawn
- **THEN** external connectors are grouped by visible ancestors, type and scope with a count
- **AND** internal relationships show an internal-dependencies count rather than a self-arrow
