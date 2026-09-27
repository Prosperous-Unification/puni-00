## ADDED Requirements

### Requirement: Every leaf holds one step node per project step

The system SHALL treat each pair of a leaf work item and a project step as one step node, whether or not any estimate, actual, measure, progress or assignment is stored for it. A step node's ID SHALL be a versioned encoding of its work item ID and step ID, and SHALL NOT change when the work item is renumbered, reparented while it stays a leaf, or when the step is renamed or reordered. A work item with children SHALL have no step nodes. A leaf in a project with no steps SHALL have no step nodes and SHALL keep a zero-time work-item boundary for scheduling. A malformed or unknown step node ID SHALL be refused as a modeled 4xx, never read as another node.

#### Scenario: A node exists before anything is recorded for it

- **GIVEN** leaf 010 in a project with steps Dev and QA and no facts stored for 010.QA
- **WHEN** 010's step nodes are read
- **THEN** both 010.Dev and 010.QA are returned with their step node IDs

#### Scenario: Renumbering keeps the identity

- **GIVEN** leaf 010's Dev node has step node ID N
- **WHEN** the work item is renumbered to 030
- **THEN** its Dev node still has ID N

#### Scenario: A parent has no step nodes

- **GIVEN** 020 has children
- **WHEN** a command addresses a step node ID naming 020 and Dev
- **THEN** it is refused as a modeled 4xx naming the parent and nothing is written

#### Scenario: A project without steps has no step nodes

- **GIVEN** a project whose steps were all removed
- **WHEN** a leaf's step nodes are read
- **THEN** none are returned and the leaf still schedules through its work-item boundary

### Requirement: Steps carry immutable step codes

Every step SHALL carry a step code unique within its project: a lowercase letter followed by lowercase letters, digits or hyphens, at most 32 characters. Creating a step SHALL suggest a code derived from its name, adding a numeric suffix on collision, and SHALL accept an explicit code. Renaming or reordering a step SHALL NOT change its code. A code matching `s<digits>` or starting `s<digits>-` SHALL be refused as reserved. A step created without a code by an older writer during a blue/green swap SHALL read as visibly uncoded, SHALL remain addressable by step node ID, SHALL refuse step-reference input naming it, and SHALL be coded by the post-swap backfill.

#### Scenario: Rename keeps the code

- **GIVEN** a step Dev with code `dev`
- **WHEN** it is renamed Implementation
- **THEN** its code stays `dev`

#### Scenario: A reserved code is refused

- **WHEN** a step is created with code `s2-review`
- **THEN** the create is refused as a modeled 4xx and no step is written

#### Scenario: A colliding suggestion gets a suffix

- **GIVEN** a project already holding code `review`
- **WHEN** a step named Review! is created without a code
- **THEN** its suggested code is `review-2`

#### Scenario: An uncoded step is visible, not defaulted

- **GIVEN** a step written by an older binary with no code
- **WHEN** a leaf's step nodes are read
- **THEN** that node is marked uncoded with no step reference
- **AND** after the backfill it carries a code derived as for a new step

### Requirement: Step references spell step nodes readably

The canonical step reference SHALL be the work item number, a dot and the step code, such as `010.dev` or `020.2.review`. Input SHALL also accept `<number>.s<ordinal>-<code>`, where the ordinal is the step's 1-based displayed position, and SHALL refuse it unless the ordinal and code name the same step. The alias SHALL NOT be stored or returned as canonical. A reference SHALL resolve only within an explicit project at an explicit revision; an unknown number, unknown code, parent work item, mismatched alias or stale revision SHALL be refused as a modeled 4xx. Renumbering SHALL change the reference and not the step node ID; a frozen number SHALL keep it stable.

#### Scenario: Canonical references resolve

- **GIVEN** leaf 020.2 with step code `review`
- **WHEN** `020.2.review` is resolved at the current revision
- **THEN** it returns 020.2's Review step node ID

#### Scenario: A mismatched ordinal alias is refused

- **GIVEN** steps in order Dev, QA
- **WHEN** `010.s2-dev` is resolved
- **THEN** it is refused because position 2 is QA, and nothing is resolved

#### Scenario: A stale reference is refused

- **GIVEN** `010.dev` was read at revision r and 010 was renumbered at r+1
- **WHEN** `010.dev` is submitted with revision r
- **THEN** it is refused as stale rather than resolved to the new 010

### Requirement: One seam resolves the step-node graph with provenance

The domain SHALL resolve one step-node graph whose nodes are step node IDs or work-item boundaries and whose edges each carry predecessor, successor, relationship type and provenance: `workflow` for step order within a leaf and `legacy` for a project-reach dependency. Fast and the solver request builder SHALL both schedule from that graph. Introducing it SHALL NOT change any schedule, projection or canonical scheduler input.

#### Scenario: Step order becomes workflow edges

- **GIVEN** a leaf with Dev then QA
- **WHEN** the graph is resolved
- **THEN** it holds one FS edge from its Dev node to its QA node with provenance `workflow`

#### Scenario: Schedules are unchanged

- **GIVEN** the existing Fast and solver golden corpora
- **WHEN** they are scheduled through the new seam
- **THEN** every start, finish, projection and request hash is unchanged

### Requirement: Step nodes follow leafhood through structural edits

When a leaf gains its first child, each of its step nodes SHALL map one-to-one to the child's node for the same step, and that node's estimate, actual, measures, progress and assignment SHALL move with it within the create's transaction; the edit SHALL journal the mapping so undo and redo restore the exact step node IDs and facts. Moving a leaf SHALL keep its step node IDs while it stays a leaf. Deleting a work item SHALL remove the step nodes in its subtree; when that leaves a parent childless, the existing fold of facts onto the parent SHALL continue and SHALL NOT be a step node mapping. A parent left childless by a move SHALL gain step nodes holding whatever facts the existing rules leave it. Deleting a step SHALL remove its step nodes with the step's existing usage refusal.

#### Scenario: Hand-down moves a node's facts

- **GIVEN** leaf 010 with an estimate and progress on its Dev node
- **WHEN** 010 gains its first child 010.1
- **THEN** 010.1's Dev node holds that estimate and progress and 010 has no step nodes
- **AND** undo restores them on 010's original Dev node ID

#### Scenario: Hand-down moves an assignment

- **GIVEN** leaf 010 with Ann assigned on its Dev node
- **WHEN** 010 gains its first child 010.1
- **THEN** Ann is assigned on 010.1's Dev node and undo restores her on 010's Dev node

### Requirement: A step cell names its step node

Opening a leaf's step cell SHALL show its step reference and step name, such as `010.dev · Dev`, and SHALL offer copying the step reference and copying a link that addresses the project and step node ID. Opening the link SHALL select its project, reveal its leaf and focus that step cell. A project absent from the viewer's catalog SHALL be visibly refused. An uncoded node SHALL say so instead of showing a reference. Step columns, their order and their resting cell contents SHALL remain unchanged. Columns and node metadata SHALL use the same tree response during independently delivered step and tree refreshes.

#### Scenario: Copying a node reference

- **GIVEN** leaf 010's Dev cell is open
- **WHEN** Copy reference is chosen
- **THEN** `010.dev` is copied and the action is announced to assistive technology

#### Scenario: Opening a copied step link from another project

- **GIVEN** project B is remembered in the browser and a link was copied from project A's leaf step
- **WHEN** the link is opened
- **THEN** project A is selected and remembered, its leaf is revealed, and its step cell receives focus

#### Scenario: Reaching a hover card action

- **GIVEN** a folded step card opened when an unfocused cell was hovered
- **WHEN** the pointer leaves the cell and reaches the diagonally placed card
- **THEN** the card remains open long enough to activate Copy link

#### Scenario: Step responses arrive separately

- **GIVEN** a tree response and an independently fetched step list
- **WHEN** a step is added or deleted and those responses arrive in either order, or one refresh fails
- **THEN** the rendered step columns agree with the installed tree's node metadata and the table remains usable
