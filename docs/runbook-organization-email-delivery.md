# Password verification email submission

The optional adapter configured by `readEmailDelivery` and mounted by `bootBe01`
submits password-email verification codes. It does not deliver invitations or
approved join requests: both remain explicitly refusing even with SMTP enabled.
The invitation eligibility prerequisite is recorded in
[the separate follow-on packet](../openspec/changes/organization-email-delivery/invitation-eligibility.md).
This slice cannot complete WBS010.5.4 by itself.

## Disabled and configured modes

With every supported SMTP variable absent, delivery stays disabled. Challenge
issuance returns the existing `503 delivery_failed` and records failed delivery.
Any present setting requires the full configuration below; empty values are not
absence. Invalid settings or missing/unreadable/malformed CA trust refuse startup.
No localhost, sendmail, machine-hostname, default sender, system CA or service
preset is used as fallback mail authority.

Supply these through the deployment's existing reviewed environment/secret and
CA-file provisioning. No credentials, mounts, production environment changes or
activation are supplied by this code change.

| Setting                                  | Required authority                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `WBS_SMTP_HOST`                          | Explicit relay IP address or canonical DNS name                             |
| `WBS_SMTP_PORT`                          | Explicit integer TCP port 1–65535                                           |
| `WBS_SMTP_TLS`                           | Exactly `implicit`; no plaintext/STARTTLS mode                              |
| `WBS_SMTP_SERVER_NAME`                   | Canonical DNS name the certificate must cover                               |
| `WBS_SMTP_CA_FILE`                       | Absolute readable path to explicit PEM trust certificates                   |
| `WBS_SMTP_EHLO`                          | Explicit canonical DNS client identity                                      |
| `WBS_SMTP_FROM`                          | One canonical lowercase ASCII mailbox, used for envelope/header sender      |
| `WBS_SMTP_AUTH`                          | Exactly `none` or `plain`; none is an explicit unauthenticated relay choice |
| `WBS_SMTP_USERNAME`, `WBS_SMTP_PASSWORD` | Both required/nonempty only for plain; both forbidden for none              |

The relay identity is verified with configured CA bytes and server name, with
TLS 1.2 as the minimum. PLAIN credentials are sent only after verified TLS.
Configured CA bytes are read at startup; rotating settings or the CA file requires
a controlled process restart using the existing deployment runbook. Absence of
configuration does not weaken the independent organization activation gates.

The mailbox policy supports ASCII dot-atom local parts and DNS domains, one
recipient only. Display names, lists, quoted/Unicode mailboxes and header/control
characters are refused. Fixed messages ask the recipient to enter the code in WBS;
there is no token-bearing URL, HTML or attachment feature.

## Acceptance and failure

One submission uses one maintained-client connection/send, without a pool, queue,
fallback relay or hidden resend. The work budget is 9s, with at most 1s reserved for
native socket close and a 10s total allowance. These are absolute eligibility deadlines, not a hard
wall-time guarantee while the process or OS is not scheduled. Inbound plaintext is bounded at 64KiB
in aggregate; the client's 8KiB partial-buffer guard is not a complete-reply cap.

Success requires final post-DATA 250, exactly the intended accepted recipient,
no rejected recipient and observed native close. This proves relay acceptance,
not inbox receipt, deliverability or address ownership. Address ownership still
requires the signed-in user to consume the current expiring code once.

Refusal, timeout, lost final acknowledgement and failed close acknowledgement
return a sanitized failure and mark the challenge failed. Even if a relay exposed
the message before a lost acknowledgement, that code cannot confirm the account.
The app does not resend it automatically. A user may explicitly request a new
challenge; existing challenge supersession and single-use rules apply. A failed
compensation-store write remains a server failure and cannot mark an uncertain
challenge delivered.

Do not enable transcript/debug logging. Diagnostics expose finite submission
reasons without raw SMTP responses, credentials, CA contents or tokens. Inspect
relay-side evidence only under the operator's separate secret-handling policy.

## Acceptance still required outside the repository

Operators must establish relay authority/reachability, credentials or the explicit
unauthenticated policy, certificate trust, sender/domain policy and actual inbox
receipt. Hosted exact CI, canonical h2 gating, deployment proof and owner review
remain release requirements. Controlled local TLS fixtures establish software
behavior; they do not authorize live activation or prove those external facts.
