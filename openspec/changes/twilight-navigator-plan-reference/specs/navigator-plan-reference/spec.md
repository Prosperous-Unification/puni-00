## ADDED Requirements

### Requirement: Navigator accepts only its declared commands and flags

The `twin` CLI SHALL accept exactly `plan-reference` and `receipt-to-commands`, each with its
declared flags given once with a nonempty value. It SHALL refuse any other command and any
unknown, duplicate, missing or valueless flag with exit code 2 before reading any input or
creating any output.

#### Scenario: Unknown command or flag

- **WHEN** `twin` receives an unsupported command, or a supported command with an extra, repeated or valueless flag
- **THEN** it exits 2 with a diagnostic naming the command or flag and creates no file

### Requirement: Navigator writes a plan reference from a WBS plan export

`twin plan-reference` SHALL read one WBS plan export of version 7 and one requirements file and
write `tasks.json` and `plan-reference.json` into an existing output directory, each created
exclusively with mode 0600. The plan reference SHALL decode through Burokrat's `decodeRecord`,
bind the task export by digest, and take its `createdAt` from the export. Identical inputs SHALL
produce identical bytes. Nothing is sent over a network.

#### Scenario: Valid export

- **WHEN** a version-7 export, a requirements file and valid identifiers are supplied
- **THEN** both files are written, the plan reference decodes, and stdout prints its digest

#### Scenario: Wrong document version

- **WHEN** the export's document version is not 7
- **THEN** the command fails and creates no file

#### Scenario: Missing, unreadable or malformed input

- **WHEN** the export or requirements file is absent, unreadable, or not valid for its format
- **THEN** the command fails with a diagnostic naming the file and the kind of failure, and creates no file

#### Scenario: Occupied output

- **WHEN** either output file already exists
- **THEN** the command fails, the existing bytes are unchanged and no other output remains
