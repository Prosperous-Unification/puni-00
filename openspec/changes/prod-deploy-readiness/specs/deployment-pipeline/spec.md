## ADDED Requirements

### Requirement: The swap refuses an incomplete environment before any side effect

The swap SHALL refuse to start the incoming colour when its tier's env files lack a key the release requires or hold an empty value for one. It SHALL also refuse an auth mode the image cannot boot. Each refusal SHALL name every missing key and the file that must carry it, never a value, and SHALL occur before the phase marker, Compose file or container changes. The prod layout SHALL carry an operator-authored OIDC file to be and gw, limited to the provider allowlist.

#### Scenario: A missing key is named before anything starts

- **GIVEN** a be env file without `GW_URL`
- **WHEN** the swap starts the incoming colour
- **THEN** it refuses, naming `GW_URL` and the be env file, and writes no phase and runs no Compose

#### Scenario: Local auth mode is refused for the production image

- **GIVEN** an app env file with `AUTH_MODE=local`
- **WHEN** the swap starts the incoming colour
- **THEN** it refuses, naming the image's `NODE_ENV=production`

#### Scenario: An OIDC file without a provider key is refused

- **GIVEN** `AUTH_MODE=oidc` and an OIDC file without `AUTH_AUDIENCE`
- **WHEN** the swap starts be or gw
- **THEN** it refuses, naming `AUTH_AUDIENCE` and the OIDC file

### Requirement: The no-prod-release gate has one evidence-gated override

`bin/assert-no-prod-release.sh` SHALL refuse a recorded release by default. With `--override-with-ledger=<dump>`, it SHALL pass only when the dump lists exactly `20260426171432_talented_smiling_tiger`. It SHALL still refuse any unreadable state or ledger and any unknown argument.

#### Scenario: A product ledger refuses the override

- **GIVEN** a recorded release and a ledger dump listing a later migration
- **WHEN** the gate runs with the override
- **THEN** it refuses

### Requirement: A be swap backs up the database before migrating

A `be` swap SHALL write a `VACUUM INTO` snapshot from the incoming container before the migrate step. It SHALL publish that snapshot only after `integrity_check` passes and the migration ledger is nonempty, and SHALL abort before migrating when the backup fails. A restore SHALL verify the snapshot before replacing the database and SHALL move the replaced files aside.

#### Scenario: A failed backup aborts before migrating

- **GIVEN** the backup command fails
- **WHEN** the be swap runs
- **THEN** no migration runs, the incoming colour stops and the phase marker is rewound

#### Scenario: A restore returns the pre-deploy database

- **GIVEN** a snapshot taken at the skeleton ledger, then a forward migration and a new write
- **WHEN** the snapshot is restored
- **THEN** the database holds the skeleton ledger and only the pre-snapshot rows

#### Scenario: A corrupted snapshot is not restored

- **GIVEN** a snapshot whose pages were overwritten
- **WHEN** it is restored
- **THEN** the restore refuses and the database is unchanged

### Requirement: Smoke checks the read paths

Smoke SHALL check that `/api/auth/me` without a credential answers `{"user":null}`. It SHALL check that `/api/projects` without a credential is refused with 401. When an operator-authored account is configured, smoke SHALL read both routes with a session minted from the deployed signing key. Without an account, it SHALL report those two checks as skipped, never as passed.

#### Scenario: Anonymous project reads fail smoke

- **GIVEN** `/api/projects` answers 200 without a credential
- **WHEN** smoke runs
- **THEN** the anonymous-refusal check fails
