## MODIFIED Requirements

### Requirement: Declared capacity is shown with the measured figure and adopted only by an explicit command

`GET /api/projects/:id/resources` SHALL carry, per resource, `providerId`; a resource that
names an instance SHALL also carry `provider { kind, name }` for every reader (never the
locator, which only the admin-only instances list carries), when a report exists, `report`
as stored, and always
`measurement { declared, measured, measuredAt, state }`: this project's stated units or null,
the latest measured capacity or null, the latest report's `observedAt` or null, and `state`
one of `no_report`, `measured`, `unreachable` or `stale` (`stale` once
`now - observedAt > 3 × cadenceSeconds`, whatever the outcome). The project settings resources section (whose rows are the
directory's resources) SHALL show, beside a capacity whose resource names an instance, the report in one of the
rendered states: `no report yet`, `measured <capacity> <unit>, <usage> in use, <age>`,
`unreachable <age>: <reason>`, each marked `stale` once `now - observedAt > 3 ×
cadenceSeconds`; a resource without an instance SHALL show nothing extra. Each directory
resource row of the Resources section SHALL carry a chip naming the instance's kind and name
(`SSH host · h4claw`) for every reader, off the read's `provider`; an admin additionally gets
the picker that changes the reference. A read naming an instance without `provider` (an
outgoing be-01 mid-swap) SHALL show that a compute provider fulfils the resource, unnamed. "Adopt measured" SHALL write
`setDirectoryCapacity { resourceId, units: capacityUnits }` when the resource states a
directory capacity, and otherwise `setResourceCapacity { resource, units: capacityUnits }` for
that project, the explicit command a project writer
could always send for declared capacity; the UI SHALL offer Adopt to organization admins only, and SHALL name which capacity it writes.
Neither command is journalled, so the plan's undo does not reverse it: the UI's Undo SHALL be
the same command with the previous value (or `null` when it was unstated), offered only while
the stated value still equals the adopted one. Nothing SHALL
adopt a measurement without that act.

#### Scenario: The chip beside the capacity

- **WHEN** `h4claw ram` is stated at 32 GB for project P and the stored report is measured 15
  with 8 in use, observed 4 minutes ago at a cadence of 300 s
- **THEN** the row reads `32 GB` with the chip `SSH host · h4claw` and `measured 15 GB, 8 in
use, 4 min ago` and no stale mark; at 16 minutes it is marked stale

#### Scenario: The directory row names the instance for a member

- **WHEN** a member opens project settings → Resources and `h4claw ram` names the `ssh_host`
  instance `h4claw`
- **THEN** the resources read carries `provider { kind: ssh_host, name: h4claw }` and no
  locator, the row shows the chip `SSH host · h4claw`, and the member gets no picker and no
  Adopt; `staging`, naming no instance, shows no chip

#### Scenario: Adopting the measurement

- **WHEN** an admin clicks adopt on that row
- **THEN** one `setResourceCapacity { resource: <h4claw ram>, units: 15 }` is applied, the
  schedule recomputes from 15, and the row offers Undo, which sends
  `setResourceCapacity { resource: <h4claw ram>, units: 32 }` and restores 32

#### Scenario: Undo is withdrawn once another writer states a different number

- **WHEN** after the adoption another writer states `h4claw ram` at 20 GB for P and the
  section reads again
- **THEN** the row reads `20 GB` and offers no Undo, so 32 is never written over 20

#### Scenario: A resource without an instance

- **WHEN** `staging` has no `providerId`
- **THEN** its row shows the capacity alone, and the resources read carries `providerId: null`
  and no `report`

#### Scenario: Adopting onto a directory capacity

- **WHEN** `h4claw ram` states a directory capacity of 32 and an admin adopts a measured 15
- **THEN** one `setDirectoryCapacity { h4claw ram, units: 15 }` is applied, no project
  capacity is written, and Undo sends `setDirectoryCapacity { h4claw ram, units: 32 }`
