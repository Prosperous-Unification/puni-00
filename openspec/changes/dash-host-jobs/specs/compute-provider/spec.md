## ADDED Requirements

Written as ADDED because the `compute-provider` main spec has not been synced from
`compute-providers` yet; it amends that change's capacity-report and reporter requirements.

### Requirement: A capacity report may carry reserved units apart from measured usage

The capacity report body SHALL accept an optional `reservedUnits` (whole number, 0 to
1,000,000,000) beside `usageUnits`, stored on the report row and answered with it; a report
without it SHALL behave byte for byte as before. `report-capacity` SHALL accept a binding whose
`source` is `host_pool` and whose `dimension` names `cpuCores`, `memoryGib`, `tmpDiskGib` or an
exclusive id, reading the reserved sum from the managed-resource ledger of the same host into
`reservedUnits` while `usageUnits` keeps the adapter's measurement, and SHALL re-observe that
binding on the ledger's change notification. The planning inputs SHALL NOT read
`reservedUnits`.

#### Scenario: Reserved beside measured

- **WHEN** the reporter observes `h2puni ram` with the ssh adapter reading 8 in use and the
  ledger reserving 12
- **THEN** the report carries `usageUnits: 8` and `reservedUnits: 12`, and the schedule hash is
  unchanged

#### Scenario: A report without reserved units

- **WHEN** a reporter on the pre-change body `PUT`s a measured report
- **THEN** it is stored and answered as before, with `reservedUnits` absent
