## MODIFIED Requirements

### Requirement: Dependencies constrain scheduled slices

Typed dependencies SHALL permit endpoints in the same project or in different readable projects of one organization, and SHALL name predecessor and successor endpoints of scope whole, node (a leaf's step node ID) or descendant-step (a parent and a step), and support FS, SS and FF as lower-bound inequalities: successor start no earlier than predecessor finish, successor start no earlier than predecessor start, and successor finish no earlier than predecessor finish, respectively. They SHALL NOT require simultaneous boundaries. A leaf whole endpoint SHALL resolve to its step graph's boundary nodes — predecessor sinks to successor sources for FS, sources to sources for SS and sinks to sinks for FF — which under the step-order chain are last→first, first→first and last→last; node endpoints SHALL use their own start or finish. Parent and descendant-step endpoints SHALL apply the chosen relationship to every resolved predecessor/successor leaf pair, not to a parent envelope. Resolved typed edges SHALL carry `authored` provenance and their relationship ID beside `workflow` and `legacy` edges. Legacy `depReach` links SHALL retain their original dynamic FS interpretation. Unknown step nodes SHALL remain zero-duration graph nodes; a project without configured steps SHALL offer whole scope only, resolved to each leaf's work-item boundary. The combined step-node graph, including workflow and legacy edges, SHALL be revalidated atomically after every typed or legacy write, reparent, project-step structural edit, project `depReach` change, estimate-driven legacy-anchor change, undo/redo or batch replay. Self-node pairs and cycles, including mathematically satisfiable SS cycles, SHALL be refused without dropping expanded pairs; a valid step-node DAG SHALL be allowed even if work-item IDs appear cyclic. Deleting a step referenced by a node or descendant-step endpoint SHALL be refused until its typed relationships are removed or reassigned. Node endpoints SHALL follow the first-child hand-down mapping, and a structural edit leaving an endpoint without an unambiguous replacement SHALL be refused, as in the FS stage.

#### Scenario: Start-to-start permits later start

- **GIVEN** node `A.dev` → node `B.dev` SS
- **WHEN** A.Dev starts before B.Dev
- **THEN** the relationship is satisfied even if the starts differ

#### Scenario: Finish-to-finish permits early successor start

- **GIVEN** A Whole → B Whole FF and B is longer than A
- **WHEN** B starts before A but finishes no earlier than A
- **THEN** the relationship is satisfied, subject to other constraints

#### Scenario: Parent SS waits for every leaf start

- **GIVEN** a parent A with two leaves, one of which has not started
- **WHEN** A Whole → B Whole SS is scheduled
- **THEN** B's first step node cannot start solely because the first A leaf started

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

#### Scenario: External nodes use their own project steps

- **GIVEN** two projects have different step catalogs
- **WHEN** a typed dependency is resolved between their nodes
- **THEN** each endpoint uses its own project catalog and its FS, SS or FF boundary is enforced across the connected graph

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

### Requirement: Explicit dependencies are editable from the table and chart

The Depends on picker SHALL add Whole→Whole FS by clicking a search result after opening it, and SHALL preselect the same step on both sides, by step ID within the same project, when opened from a step cell; an explicit choice SHALL win, and a predecessor lacking that step SHALL show the choice unavailable rather than substitute another. Its separate Customize action SHALL open endpoint editing without creating a dependency and SHALL offer FS, SS and FF with full names and lower-bound explanations. Chips SHALL spell the predecessor by step reference or work-item number, then the type, then the successor's step code when not whole, and SHALL NOT spell a descendant-step endpoint as one step reference; full accessible labels SHALL name both work items and steps. The editor SHALL preserve step order, explain parent expansion and show refusals. Keyboard and mobile users SHALL create, inspect, edit and remove the same relationships without hover. Gantt FS arrows SHALL attach actual finish→start, SS start→start and FF finish→finish boundaries, including zero-time ticks for unknown step nodes; their chips and cards SHALL highlight the same relationship. Collapsed proxies SHALL group by visible ancestors, type and scope with counts; wholly internal links SHALL show an internal-dependencies count rather than a self-arrow.

#### Scenario: A planner chooses FF

- **GIVEN** B's dependency editor is open
- **WHEN** the planner chooses A Whole, B QA and FF, then adds it
- **THEN** the chip reads `[010 FF → qa]`
- **AND** the Gantt arrow joins A's actual finish to B.QA's actual finish

#### Scenario: Keyboard and mobile expose type

- **GIVEN** keyboard navigation or a mobile dependency card
- **WHEN** an SS or FF relationship is focused
- **THEN** its full wording, endpoints, Edit and Remove are available without hover

#### Scenario: One-click FS remains distinct from Customize

- **GIVEN** the dependency picker is open on B
- **WHEN** A's search result is clicked
- **THEN** one Whole A → Whole B FS dependency is committed
- **AND** activating A's Customize control instead opens fields without a write

#### Scenario: Unknown arrow uses actual time

- **GIVEN** an unestimated endpoint with a visual placeholder
- **WHEN** its relationship arrow is drawn
- **THEN** the arrow attaches to its zero-time scheduled boundary, not the placeholder edge

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

#### Scenario: External selection uses project-qualified addresses

- **GIVEN** a dependency picker opened from a row or step cell
- **WHEN** the user selects a predecessor from another project
- **THEN** the endpoint editor reads that project's own steps and the chip uses its qualified address
- **AND** no project-level cycle refusal replaces resolved task/step graph validation
