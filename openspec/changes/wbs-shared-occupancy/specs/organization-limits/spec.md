## ADDED Requirements

### Requirement: The capacity cap bounds a directory capacity

`setDirectoryCapacity` SHALL be refused `capacity_limit`, naming the resource, the cap and the
asked units, when the asked units exceed the organization's `maxCapacityUnitsPerResource`. For
a resource with a stated directory capacity, the sum of its project capacities SHALL NOT be
checked against the cap; for a resource without one, the existing sum check SHALL apply
unchanged.

#### Scenario: Above the cap

- **WHEN** the cap is 64 and an admin states a directory capacity of 65
- **THEN** the command is refused `capacity_limit` naming cap 64 and asked 65

#### Scenario: Overlapping ceilings under a directory capacity

- **WHEN** the cap is 64, the directory capacity is 16, and three projects each state 32
- **THEN** each `setResourceCapacity` is applied
