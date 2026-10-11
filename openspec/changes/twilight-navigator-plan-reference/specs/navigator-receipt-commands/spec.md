## ADDED Requirements

### Requirement: Navigator turns a progress receipt into a WBS command batch

`twin receipt-to-commands` SHALL decode a progress receipt and a plan reference through
Burokrat, verify both digests, verify the task export against the reference's `tasksDigest`,
and refuse a receipt whose `planRef` differs from the reference's or whose entry names a task or
step code absent from the task export. It SHALL write one WBS command-batch document
`{ id, commands }`, created exclusively with mode 0600, holding per entry in receipt order one
`setProgress` and one `setMeasure` per present measure. The batch SHALL validate against the WBS
command batch contract. Navigator SHALL NOT apply the batch.

#### Scenario: Valid receipt

- **WHEN** a receipt matching its plan reference and task export is supplied
- **THEN** the batch holds the commands in entry order and validates as a WBS command batch

#### Scenario: Receipt for another plan reference

- **WHEN** the receipt's `planRef` differs from the plan reference's
- **THEN** the command fails and creates no file

#### Scenario: Unknown task or step

- **WHEN** an entry names a task or step code absent from the task export
- **THEN** the command fails and creates no file

#### Scenario: Tampered record

- **WHEN** a receipt, plan reference or task export no longer matches its digest
- **THEN** the command fails and creates no file
