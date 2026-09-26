## MODIFIED Requirements

### Requirement: Dependencies constrain scheduled slices

Typed dependencies SHALL name predecessor and successor endpoints of scope whole, node (a leaf's step node ID) or descendant-step (a parent and a step), and support FS, SS and FF as lower-bound inequalities: successor start no earlier than predecessor finish, successor start no earlier than predecessor start, and successor finish no earlier than predecessor finish, respectively. They SHALL NOT require simultaneous boundaries. A leaf whole endpoint SHALL resolve to its step graph's boundary nodes — predecessor sinks to successor sources for FS, sources to sources for SS and sinks to sinks for FF — which under the step-order chain are last→first, first→first and last→last; node endpoints SHALL use their own start or finish. Parent and descendant-step endpoints SHALL apply the chosen relationship to every resolved predecessor/successor leaf pair, not to a parent envelope. Legacy `depReach` links SHALL retain their original dynamic FS interpretation. Unknown step nodes SHALL remain zero-duration graph nodes; a project without configured steps SHALL offer whole scope only, resolved to each leaf's work-item boundary. The combined step-node graph, including workflow and legacy edges, SHALL be revalidated atomically after every typed or legacy write, reparent, project-step structural edit, estimate-driven legacy-anchor change, undo/redo or batch replay. Self-node pairs and cycles, including mathematically satisfiable SS cycles, SHALL be refused without dropping expanded pairs; a valid step-node DAG SHALL be allowed even if work-item IDs appear cyclic. Deleting a referenced step SHALL be refused until its typed relationships are removed or reassigned.

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

### Requirement: Explicit dependencies are editable from the table and chart

The Depends on picker SHALL add Whole→Whole FS by clicking a search result after opening it, and SHALL preselect the same step on both sides when opened from a step cell. Its separate Customize action SHALL open endpoint editing without creating a dependency and SHALL offer FS, SS and FF with full names and lower-bound explanations. Chips SHALL spell the predecessor by step reference or work-item number, then the type, then the successor's step code when not whole, and SHALL NOT spell a descendant-step endpoint as one step reference; full accessible labels SHALL name both work items and steps. The editor SHALL preserve step order, explain parent expansion and show refusals. Keyboard and mobile users SHALL create, inspect, edit and remove the same relationships without hover. Gantt FS arrows SHALL attach actual finish→start, SS start→start and FF finish→finish boundaries, including zero-time ticks for unknown step nodes; their chips and cards SHALL highlight the same relationship. Collapsed proxies SHALL group by visible ancestors, type and scope with counts; wholly internal links SHALL show an internal-dependencies count rather than a self-arrow.

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
