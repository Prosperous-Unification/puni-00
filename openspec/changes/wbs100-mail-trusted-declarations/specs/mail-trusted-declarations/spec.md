## ADDED Requirements

### Requirement: SMTP declarations are finite release-owned inputs

The trusted declaration roots SHALL explicitly include the locked nodemailer package and its bundled declarations. Existing package, toolkit and relocation producers SHALL derive the same finite closure. Candidate imports SHALL NOT enroll additional packages, and @types/nodemailer SHALL NOT be added.

#### Scenario: The reviewed SMTP package is included without unrelated packages

- **GIVEN** the locked Nodemailer installation with bundled declarations and no runtime dependencies
- **WHEN** the shared closure is derived
- **THEN** nodemailer is included and unrelated installed packages are excluded

### Requirement: Installed extraction preserves public SMTP types

The installed package SHALL resolve value and named type imports from nodemailer/lib/smtp-connection and emit public declarations containing SMTPConnection and SMTPConnectionOptions without source-checkout access or candidate node_modules.

#### Scenario: SMTP subpath and public types resolve

- **GIVEN** a committed candidate exporting a constructor function typed with SMTPConnectionOptions and SMTPConnection
- **WHEN** the installed executable extracts its relationships outside the source checkout
- **THEN** it succeeds with the subpath value/type imports and both public types preserved

#### Scenario: SMTP root is omitted

- **GIVEN** the preserved authenticated DNS successor without nodemailer
- **WHEN** the same installed fixture extracts its relationships
- **THEN** extraction refuses the unresolved SMTP subpath

#### Scenario: Copied SMTP declaration is missing or corrupted

- **GIVEN** a complete installed successor
- **WHEN** its copied SMTP declaration file is removed or its bytes changed
- **THEN** toolkit authentication refuses with empty report output
- **AND** restoring its exact bytes restores the original report
