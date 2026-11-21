# Work Package Assignment Reads Specification

## Purpose

Bound assignment and assigned-name reads to the work package or work item that requested them while preserving existing assignment consumers.

## Requirements

### Requirement: Plan assignment projections are scoped to the work package

A tree read SHALL read only assignments belonging to its requested work package and only assigned person id/name fields. Unrelated assignments, people and memberships SHALL NOT be scanned or materialized for that projection.

#### Scenario: [PROJECT-ASSIGNMENT-READS-001] Tiny work package among unrelated work packages

- **GIVEN** one assigned work item in the requested work package and many assigned work items and people in unrelated work packages
- **WHEN** the production tree read runs
- **THEN** its assignment/name projection returns only the requested assignment and name using indexed searches without global assignment or person scans

### Requirement: A single work-item assignment read is bounded

An assignment write SHALL read its prior assignment through the work item's indexed assignment key. Reads SHALL NOT require an arbitrary large IN list.

#### Scenario: [PROJECT-ASSIGNMENT-READS-002] Assignment write among unrelated work packages

- **WHEN** an assignment is changed on a work item while unrelated work packages hold many assignments
- **THEN** reading its prior assignment visits only assignments on that work item and undo preserves the prior assignee

### Requirement: Store projections preserve existing consumers

Subset reads and test stores SHALL preserve assignment contents and work package isolation.

#### Scenario: [PROJECT-ASSIGNMENT-READS-003] Different work packages in the memory fixture

- **WHEN** two work packages hold assignments to different people
- **THEN** each tree contains only its own assignments and assigned names
