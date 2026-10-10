## ADDED Requirements

### Requirement: Lockout before password verification

`POST /operator/session` SHALL read `login_failure` for the caller's source and for the account before any Argon2id verification. Five failures from one source inside a 15-minute window SHALL lock that source for 15 minutes; twenty failures on the account inside a 60-minute window SHALL lock the account for 60 minutes and raise the `operator_locked` alert. A locked caller SHALL be answered 429 `login_locked` with `Retry-After` and without a password verification; the body SHALL NOT say which scope is locked. A failed verification SHALL record one failure in both scopes in one transaction; a successful verification SHALL delete the source's row and leave the account row to its window. Existing operator sessions SHALL be unaffected by a lock.

#### Scenario: Sixth guess from one source

- **WHEN** one source has failed five times within 15 minutes and posts again, with the correct password
- **THEN** the API answers 429 `login_locked` with `Retry-After`, the fake verifier records no call, and no session is created

#### Scenario: Account lock across sources

- **WHEN** twenty failures within an hour arrive from twenty different sources
- **THEN** the next attempt from a fresh source answers 429 `login_locked`, a `guardrail_alert` row of kind `operator_locked` exists, and a session created before the lock still answers `GET /operator/session` 200

#### Scenario: Lock expires

- **WHEN** 15 minutes have passed since a source lock opened and the correct password is posted
- **THEN** the API answers 201, the source's failure row is deleted and the account's failure count is unchanged

#### Scenario: Failure window resets

- **WHEN** a source failed four times, then 16 minutes pass, then it fails once more
- **THEN** the source is not locked and its row shows one failure in a new window
