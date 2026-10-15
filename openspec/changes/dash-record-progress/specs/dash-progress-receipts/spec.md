## ADDED Requirements

### Requirement: Dash records explicit operator progress

Dash SHALL expose `record-progress` with exactly four required, nonempty flags, each accepted once in any order: `--entries`, `--plan-reference`, `--tasks`, and `--output`. It SHALL reject unknown, repeated, missing or valueless flags and positional operands before file access. Entries SHALL be a JSON array of the existing version 1 progress entry shape. Dash SHALL copy the supplied reference's complete PlanRef into a version 1 `progress-receipt`, compute its existing canonical digest, and emit no additional record fields.

#### Scenario: Operator records progress

- **WHEN** the production command receives consistent planning documents and valid entries containing both `in_progress` and `done`
- **THEN** its receipt contains precisely those entries and the reference's complete PlanRef, and the existing Burokrat receipt decoder accepts the computed digest

#### Scenario: Invalid invocation precedes file access

- **WHEN** a flag is unknown, repeated, missing, empty or valueless, or an extra positional operand is supplied alongside nonexistent input paths
- **THEN** Dash reports an invocation refusal, exits 1 with empty stdout, and creates no output

### Requirement: Existing contracts govern receipt emission

Dash SHALL strictly decode the reference and task export, validate the assembled receipt using `ProgressReceiptRecord`, and invoke Burokrat's `checkProgressReceiptConsistency` before output creation. It SHALL retain v6/v7 reference and schema-1 task compatibility and v8/v9 reference and schema-2 task compatibility. It SHALL refuse malformed entries, unsupported version pairs, digest mismatches, inconsistent plan identity/count, duplicate task or step identities, and entries whose task or step is absent. Native estimates SHALL remain unchanged.

#### Scenario: Existing consumers accept the emitted receipt

- **WHEN** supported reference/task pairs and valid entries pass through Dash, then the production Burokrat `validate-progress-receipt` and Navigator `receipt-to-commands` commands
- **THEN** Burokrat reports the existing bounded consistency scope and Navigator emits its existing progress and measure commands in their existing order

#### Scenario: Malformed operator entries

- **WHEN** entries are not an array, are empty, contain undeclared keys, omit required fields, or carry a refused status, measure, timestamp or evidence shape
- **THEN** Dash exits 1 with empty stdout and creates no output

#### Scenario: Inconsistent planning documents or membership

- **WHEN** inputs contain a tampered digest, a re-digested wrong plan/count/version pairing or duplicate task/step identity, a future v10 reference, or an entry naming an unknown or parent-only task or unknown step
- **THEN** Dash exits 1 with empty stdout and creates no output

### Requirement: Receipt production preserves assertions without granting authority

Dash SHALL preserve entry order and repetitions, supplied timestamps, evidence values and the distinction between absent measures and present zero measures. It SHALL NOT read a clock, derive progress or usage from CheckRun records, inspect evidence content, claim receipt authenticity or completion verification, read current WBS state, calculate blockage eligibility, apply WBS commands, open an authority store, contact a network service or invoke another executable. Command documentation SHALL identify the entries as operator-supplied assertions and direct application to the existing person/MCP workflow.

#### Scenario: Repeated entries and zero measures retain meaning

- **WHEN** entries repeat one task/step with differing statuses, nonchronological valid timestamps, absent measures and present zero measures
- **THEN** the receipt retains the exact sequence and values, and Navigator retains its existing sequential conversion behavior

#### Scenario: Evidence references are supplied assertions

- **WHEN** entries name a syntactically valid repository-relative evidence path that does not exist or an external evidence authority
- **THEN** Dash retains the evidence value without reading or authenticating it and emits only the existing progress receipt

#### Scenario: Blockage facts grant no receipt authority

- **WHEN** the v9 source export contains valid direct blockage facts and the operator supplies progress for a member task and step
- **THEN** Dash performs only existing reference/task/entry consistency checks and produces no blockage command, freshness claim or execution-eligibility verdict

#### Scenario: Recording is local and does not measure execution

- **WHEN** the command runs with dependency canaries that fail on clock reads, fleet invocation, authority access, network access or subprocess execution
- **THEN** a valid receipt is produced with the operator's original timestamps and only the requested output file is added

### Requirement: Required inputs and exclusive output fail visibly

Dash SHALL read all three input files as strict UTF-8 JSON and report missing, unreadable and malformed inputs with file-role context without exposing input contents. It SHALL complete all validation before creating the output. It SHALL write canonical JSON followed by one newline to a new file with mode 0600 in an existing directory, using exclusive creation, and print only the receipt digest plus newline after a successful write and close. All refusals SHALL exit 1 with empty stdout and the existing single-line Dash error form. A failed write SHALL remove only the partial file created by that invocation; a cleanup failure SHALL remain a visible refusal.

#### Scenario: Equivalent input values produce identical bytes

- **WHEN** equal JSON input values with different object-key ordering are recorded to two new output paths
- **THEN** both receipt files and both printed digests are byte-identical

#### Scenario: Required file failures remain distinct

- **WHEN** any input is absent, unreadable, empty, invalid UTF-8 or malformed JSON
- **THEN** the corresponding missing, unreadable or malformed refusal names its role and path, and no receipt is created

#### Scenario: Output cannot replace an existing path

- **WHEN** the output path is occupied by a file, directory or symlink, including an input path
- **THEN** Dash refuses with empty stdout and preserves every preexisting path and its bytes

#### Scenario: Output directory is unavailable

- **WHEN** the output parent is absent or unwritable
- **THEN** Dash refuses with empty stdout and creates neither the parent nor a receipt

#### Scenario: Write failure cannot leave a successful receipt

- **WHEN** writing or closing a newly created output fails
- **THEN** Dash emits no digest, removes its partial output where cleanup succeeds, and reports the failure; a cleanup failure is reported visibly
