## ADDED Requirements

### Requirement: Secrets encrypted at rest in the repo via SOPS + age

All secrets stored in the repository MUST be encrypted via SOPS using age as the backend. `.sops.yaml` MUST live at the repository root and MUST enumerate the authorized age recipient public keys. Plaintext `.env` files MUST NOT be committed to git under any path (exception: `*.env.example` files with placeholder values).

#### Scenario: A plaintext `.env` file in a commit is rejected by pre-commit

- **WHEN** a developer runs `git commit` with a staged `secrets/production.env` (plaintext)
- **THEN** the lefthook pre-commit hook rejects the commit
- **AND** prints a message explaining that secrets must be SOPS-encrypted (`*.env.sops`)

#### Scenario: Encrypted files are valid SOPS outputs

- **WHEN** `sops -d tools/tool-secrets/src/production.env.sops` runs with a valid age private key
- **THEN** the decryption succeeds
- **AND** without a valid key, decryption fails with an age-specific error

### Requirement: `tool-secrets` owns decrypt and push operations

`tools/tool-secrets/` MUST expose Nx targets `decrypt` (streams decrypted content to stdout; `cache: false`), `push` (decrypt + scp to remote `/srv/wbs/.env`), `encrypt` (re-encrypt after edit), and `updatekeys` (re-wrap the file-level data key for current `.sops.yaml` recipients).

#### Scenario: `decrypt` streams plaintext without persisting to disk

- **WHEN** `nx run tool-secrets:decrypt -- --env=production` runs
- **THEN** the decrypted content is written only to stdout (no temp file, no cache)
- **AND** `.nx/cache/` contains no decrypted content

#### Scenario: `push` delivers plaintext over SSH only

- **WHEN** `nx run tool-secrets:push -- --env=production --host=<host>` runs
- **THEN** the remote `/srv/wbs/.env` file contents match `sops -d` of the source file
- **AND** the file mode on the remote is `0600`
- **AND** no intermediate plaintext file is written to the workstation filesystem

### Requirement: Age private keys NEVER leave the developer workstation

The age private key used for decryption MUST reside only on developer workstations (at `~/.config/sops/age/keys.txt` by SOPS default) and in a developer-controlled backup (e.g., password manager). The Hetzner host MUST NOT receive, store, or process the age private key. SOPS decryption MUST happen exclusively on the developer workstation.

#### Scenario: Remote host has no age key material

- **WHEN** any file matching `keys.txt`, `*.age`, or `age-keygen` is searched for under `/` on the remote host
- **THEN** no file containing a private age key exists on the remote
- **AND** the `sops` binary is not installed on the remote

### Requirement: Managed secret variable list is explicit

The list of variables stored in SOPS-encrypted files MUST be explicitly declared in the `tools/tool-secrets/src/README.md` and MUST include (at minimum) `INTERNAL_AUTH_SECRET`, `JWT_SIGNING_KEY_CURRENT`, `JWT_SIGNING_KEY_PREVIOUS`, `OBSERVABILITY_BASIC_AUTH_HASH`, `NTFY_TOPIC_URL`. Optional additional variables (`SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`, `SMTP_*`) MAY be present depending on `NOTIFY_CHANNEL`.

#### Scenario: Required secrets are all present in the decrypted payload

- **WHEN** `sops -d tools/tool-secrets/src/production.env.sops` runs
- **THEN** the output includes non-empty values for `INTERNAL_AUTH_SECRET`, `JWT_SIGNING_KEY_CURRENT`, `OBSERVABILITY_BASIC_AUTH_HASH`, and the notification variable matching `NOTIFY_CHANNEL`

### Requirement: Age key rotation playbook documented and working

`tools/tool-secrets/src/README.md` MUST document a rotation procedure and the procedure MUST succeed when followed. The procedure MUST include generating a new age keypair, adding the new public key to `.sops.yaml`, running `sops updatekeys` on every encrypted file, and distributing the private key out-of-band to the intended human.

#### Scenario: A new recipient can decrypt after `updatekeys`

- **WHEN** a new age public key is added to `.sops.yaml` and `sops updatekeys tools/tool-secrets/src/*.env.sops` runs
- **THEN** decrypting any of the affected files with the new private key succeeds
- **AND** decrypting with any previously-authorized key still succeeds (until explicitly removed)

### Requirement: Pre-commit hook forbids plaintext-secret commits heuristically

The lefthook-installed pre-commit hook MUST reject commits adding files that look like plaintext env files (matching `**/.env` or `**/*.env` without the `.sops` or `.example` suffix) and MUST heuristically reject commits that contain obvious secret patterns (AWS access keys, JWT-like strings exceeding 40 characters in a context suggesting credentials). False positives MAY be bypassed via a clearly-labeled flag.

#### Scenario: Commit with plain `.env` is rejected

- **WHEN** `git commit` runs with a staged file named `production.env`
- **THEN** the pre-commit hook exits non-zero and the commit does not land
- **AND** the hook output names the offending file

#### Scenario: Explicit bypass flag works for documented edge cases

- **WHEN** a developer commits with `LEFTHOOK=0 git commit` (or documented equivalent) for a legitimate case
- **THEN** the pre-commit hook does not run
- **AND** the commit proceeds (the bypass is visible in local shell history but not in commit metadata)
