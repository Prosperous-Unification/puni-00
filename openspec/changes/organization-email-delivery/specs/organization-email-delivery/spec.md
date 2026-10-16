## ADDED Requirements

### Requirement: SMTP configuration is optional and explicit

The application SHALL model email submission as disabled when all supported SMTP
settings are absent. Any present SMTP setting SHALL require complete valid
configuration for explicit relay host/port, implicit TLS, verified server name,
explicit CA trust, EHLO identity, sender and authentication mode. Missing,
unreadable or malformed configured trust SHALL refuse boot before HTTP serving.
There SHALL be no sendmail, localhost, default sender, system CA or service-preset
fallback. Explicit authentication mode `none` SHALL make no authentication claim;
`plain` SHALL require credentials and use them only over verified TLS.

#### Scenario: Absent configuration

- **WHEN** the application boots without any supported SMTP setting
- **THEN** the delivery mode is disabled and challenge issuance retains the existing delivery_failed refusal and failed-state compensation

#### Scenario: Partial or invalid configuration

- **WHEN** one setting is present but required relay, identity, sender, authentication or CA configuration is incomplete, empty, invalid or unreadable
- **THEN** boot fails without opening the HTTP listener or submitting a message and without exposing secrets

### Requirement: SMTP is enabled only for password verification

The application SHALL distinguish verification and invitation message purposes.
Production boot SHALL dispatch only verification to the SMTP adapter. Invitation
issuance and join approval SHALL retain explicit refusing delivery and their
existing compensation regardless of enabled SMTP configuration. This change
SHALL NOT add migrations or enable invitation eligibility.

#### Scenario: Enabled relay cannot deliver an invitation

- **GIVEN** a configured local relay and otherwise authorized invitation issuance or join approval
- **WHEN** the mounted request attempts invitation-purpose delivery
- **THEN** it returns the existing delivery_failed refusal, opens zero relay connections, revokes the failed offer and preserves current join-request compensation behavior

### Requirement: A verification submission has one safe recipient and fixed content

The adapter SHALL validate one canonical lowercased ASCII mailbox with constrained
dot-atom local part and DNS domain, and a 64-character lowercase hexadecimal
token, before connecting. Display-name lists, multiple recipients, header/control
characters, unsupported Unicode or malformed/oversized fields SHALL be refused.
The sender SHALL satisfy the same single-mailbox policy. Fixed verification
headers/body SHALL contain no caller-controlled header or URL. SMTP envelope and
To header SHALL identify exactly the intended recipient. Tokens SHALL appear
only in the intended body, not logs, HTTP replies, stored raw values or message
identifiers. Errors SHALL be sanitized without raw protocol causes or credentials.

#### Scenario: Injection and token leakage

- **WHEN** a message contains CR/LF, a comma-separated recipient, unsupported mailbox syntax or an invalid token
- **THEN** it fails before connecting and cannot introduce another header, recipient or SMTP command

#### Scenario: Captured valid message

- **WHEN** a valid challenge is submitted to the controlled relay
- **THEN** exactly one recipient receives one fixed verification message and token scans find no token or credential in logs, HTTP responses or stored challenge fields

### Requirement: Submission uses authenticated TLS and a maintained protocol client

The SMTP adapter SHALL use the reviewed pinned maintained client for protocol
parsing/framing and a caller-owned TLS socket. It SHALL validate the explicit CA
and server identity with verification enabled, and refuse plaintext or trust
fallback. Authentication SHALL use only the configured none/PLAIN choice; there
SHALL be no OAuth, pool, proxy, service discovery or reconnect/resend behavior.
Bun compatibility SHALL be proven by a controlled native TLS submission fixture
before production composition.

#### Scenario: Wrong identity or untrusted certificate

- **WHEN** the relay certificate has the wrong name or lacks the configured trust
- **THEN** no credentials or message body are sent and submission refuses with a sanitized failure

### Requirement: Success requires final relay acceptance and native closure

A submission SHALL report success only after the maintained send callback reports
post-DATA final250, exactly the intended accepted recipient, no rejected
recipients, and observed native socket closure. RCPT acceptance, intermediate
replies, write completion, library end and cleanup initiation SHALL NOT suffice.
A final accepted response followed by loss of QUIT acknowledgement SHALL NOT
cause a resend. Relay acceptance SHALL NOT be described as inbox delivery.

#### Scenario: Missing final acknowledgement

- **GIVEN** RCPT and DATA were accepted and the body was written
- **WHEN** the relay disconnects or withholds final250
- **THEN** delivery refuses, the challenge remains unusable, and no second connection or message is attempted

#### Scenario: Final acceptance and native close

- **WHEN** final250 is received, the client reports exactly the intended accepted recipient and no rejected recipients, and the socket closes within budget
- **THEN** delivery succeeds exactly once even if no QUIT acknowledgement is available

### Requirement: Time and received bytes are bounded across the operation

The adapter SHALL stop protocol work at one absolute monotonic nine-second
budget and reserve at most one additional second for native destruction/closure.
No activity SHALL renew those budgets. Cleanup SHALL end no later than
`min(closeStartedAt + 1000ms, startedAt + 10000ms)`. Monotonic time SHALL be
checked at auth/send/body/final-ACK transitions and before publishing an outcome
against its applicable deadline, including if a timer callback is delayed.
Cancellation denotes the owned wrapper cutoff/abort, not a new HTTP-disconnect
contract. It SHALL enforce a wrapper-owned 64KiB aggregate received SMTP-byte cap,
including complete one-chunk replies, before exposing success. The client SHALL
use an 8KiB partial-buffer guard; this SHALL NOT be represented as a complete-reply
size guarantee. Timed-out,
failed or cancelled work SHALL destroy the owned socket, observe closure within
the cleanup allowance and settle once. Cleanup failure SHALL remain explicit.
Late callbacks SHALL NOT send, succeed or reconnect after termination or an
expired applicable deadline.

#### Scenario: Trickling or excessive relay output

- **WHEN** a relay trickles replies past the absolute deadline or exceeds the aggregate received-byte cap, including a complete 64KiB+1 one-chunk reply
- **THEN** submission refuses within the bounded allowance, does not leak an open socket and does not resend

#### Scenario: Logical end without native close

- **WHEN** the library signals end but native close is withheld
- **THEN** the operation cannot report success and cleanup failure is observable within its separate allowance

### Requirement: Mounted verification preserves current authority and one-use consumption

Production boot SHALL bind the configured adapter to the existing challenge
routes without weakening activation, password-account requirement, current
address ownership, digest storage, expiry or atomic one-use confirmation.
Only successful submission SHALL mark a pending challenge delivered. Disabled,
refused, uncertain or failed-cleanup submissions SHALL use current failed-delivery
compensation. A failed compensation write SHALL propagate as a server failure,
not be converted into a successful or ordinary delivery refusal.

#### Scenario: Boot-mounted success and replay

- **GIVEN** activated onboarding and a password account
- **WHEN** a real local TLS relay accepts a challenge and the recipient confirms its captured code
- **THEN** the same account becomes verified once and replay is refused

#### Scenario: Failed submission cannot verify

- **WHEN** a local relay refuses or loses final acknowledgement, including after capturing the token
- **THEN** the HTTP request reports delivery_failed, the challenge is failed and its captured token cannot verify the account

#### Scenario: Current authority or compensation changes

- **WHEN** onboarding is inactive, the account is not password-based, address ownership changes before confirmation, or compensation storage fails
- **THEN** the existing refusal/server-failure behavior is preserved and no false verification success is returned
