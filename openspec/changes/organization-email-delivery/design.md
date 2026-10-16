## Review boundary

Design reviewed on exact main `87a2b7edbfaabae889d91daa823f16f520a51cec`.
Astra approved this design and client evidence before production implementation.
The implementation scope is password-email verification only, per PM decision.
The maintained low-level client passed a controlled disposable probe; exact source review remains a separate acceptance step.

## Existing behavior and integration points

Before this change, `EmailDelivery.deliver(address, token)` was called by
`emailVerificationRoutes`, `invitationRoutes` and `joinRequestRoutes`.
`bootBe01` always bound `refusingEmailDelivery`; both process entrypoints use
`loadConfig`. Verification marks its challenge failed on transport refusal;
invitations revoke the offer; approval revokes the offer and reopens the request
unless a newer pending request exists. Repository failures propagate; a transport
refusal must never swallow a failed compensation transaction.

The UI already accepts manually entered verification/invitation codes. A fixed
plain-text verification message can name its purpose and tell the recipient to use the WBS
application without adding token-bearing URLs or new browser routes.

## Configuration and authority

A dedicated parser returns `{kind: 'disabled'}` if every supported SMTP variable
is absent. Any present field opts into complete validation; an empty string is
present and invalid. No localhost, sendmail, service preset, environment-derived
sender, implicit authentication or default system CA fallback is allowed.

Enabled configuration requires `WBS_SMTP_HOST`, `WBS_SMTP_PORT`,
`WBS_SMTP_TLS=implicit`, `WBS_SMTP_SERVER_NAME`, `WBS_SMTP_CA_FILE`,
`WBS_SMTP_EHLO`, `WBS_SMTP_FROM`, and `WBS_SMTP_AUTH=none|plain`.
`plain` requires nonempty `WBS_SMTP_USERNAME` and `WBS_SMTP_PASSWORD`;
`none` forbids either variable.
Port is an integer 1–65535; host/server name/EHLO and the single sender mailbox
are structurally validated. The CA file is read and parsed before the HTTP
listener opens; missing, unreadable, empty and malformed trust each refuse boot.
Only explicit configured CA bytes are used, with certificate identity checking
on the configured DNS server name, `rejectUnauthorized: true`, minimum TLS1.2.
No secrets or raw supplied configuration appear in errors.

Both entrypoints pass the parsed mode through `BootOptions` and boot constructs
the adapter once. Direct boot callers that omit the optional new setting remain
explicitly disabled for compatibility. Operator input is validated once by
`readEmailDelivery` through `loadConfig` before either process entrypoint invokes
boot. Internal BootOptions carry that parsed configuration, as with existing
authentication options; they are not a second untyped operator-config API. Existing
organization activation is unchanged by SMTP configuration.

## Purpose and message boundary

Replace the two string arguments with a discriminated message:
`{purpose: 'verification'|'invitation', recipient, token}`. Approved join
requests use the invitation purpose. A boot-composed dispatcher sends only
`verification`; `invitation` always rejects with the existing delivery failure
semantics, without opening a socket, even when SMTP is configured. Tests and fixtures must retain purpose as
well as address/token, so a swapped purpose is observable.

The enabled verification adapter accepts one canonical lowercased ASCII mailbox, never a display-name
list or multiple envelope recipients. Use a constrained dot-atom local part and
DNS-domain syntax; reject control characters, CR/LF, commas, semicolons, angle
brackets, quoted forms, Unicode and excess length. Existing broader HTTP inputs
may still return the existing `503 delivery_failed` if not representable by this
transport; do not silently reinterpret them into additional recipients. The
sender follows the same mailbox grammar. Tokens are exactly the existing
64-character lowercase hexadecimal form. These boundaries are tested directly
and through mounted calls before opening a socket.

Serialize fixed ASCII headers (`From`, `To`, fixed verification `Subject`,
`Date`, random token-independent `Message-ID`, MIME/content type) and a fixed
plain-text body containing the token. No caller-supplied subject, headers, URL,
attachment, organization label or raw SMTP content is accepted. The token is
present only in the intended message body and existing in-memory flow; storage
remains digest-only. Never log a transcript or raw client/server errors, which
can echo credentials or message content. Public transport failure exposes a
finite sanitized reason/stage, without the untrusted cause.

## Maintained client and owned socket

Recommended candidate: pin `nodemailer@10.1.2`, using its exported typed
`nodemailer/lib/smtp-connection` API, not private fields. Own a verified
`node:tls` socket, pause reads during setup, then pass it as the already-secured
connection. Install receive accounting before handoff; the maintained client
attaches its parser and resumes the paused socket. The probe sends an immediate
220 greeting to prove handoff does not lose early bytes. The maintained
client handles greeting/EHLO, AUTH PLAIN, envelope replies, DATA framing/dot
stuffing and reply parsing. Perform at most one `send` for one recipient on that
one session; no pool, reconnect, queue, fallback relay or retry. A configured
host may use the normal network resolver; this is not fallback mail routing.

Source evidence and compatibility limits are in [client review](client-review.md).
The high-level transport is insufficient as the cancellation primitive: its
nonpooled `close()` does not close the in-flight connection. The low-level
client's `close()` can wait 5s for physical close, so wrapper ownership of the
TLS socket is necessary for a shorter cleanup budget. No private `_socket`
access, monkey patch or general handwritten SMTP parser is proposed.

The wrapper counts decrypted received bytes across the entire SMTP session
(maximum 64 KiB), including complete replies delivered in one chunk, before
exposing success. It also configures the client's partial-buffer guard at 8 KiB;
that setting does not guarantee a bound on complete replies. Exceeding the
wrapper's aggregate cap destroys the socket and refuses; fragmentation and
trickling cannot reset byte totals or time. A complete one-chunk 64KiB+1 fixture
must fail, including when it carries an otherwise successful final250. The receive
listener must mark the operation terminal, close the public client and destroy
the owned socket before any later listener for the same event can act; destruction
alone does not remove already scheduled listeners. Test that event explicitly
for both overflow and expired input, with no late authentication/send/success.

A fresh monotonic `startedAt` applies to DNS/TCP/TLS, SMTP handshake,
authentication and DATA: `workUntil = startedAt + 9000ms`. On any terminal
transition, `closeUntil = min(closeStartedAt + 1000ms, startedAt + 10000ms)`.
Check the monotonic clock before auth/send/body work and final-ACK acceptance,
and before publishing the outcome against its applicable absolute deadline;
a late timer callback must not extend eligibility. Native close and outcome
publication may use only the bounded cleanup allowance after timely final ACK.
Deadlines bound eligibility rather than OS scheduling latency; an observable
failure can arrive later while the runtime is not scheduled. Do not renew
deadlines on activity. Shortened injected clocks/budgets exist only
in fixtures. Cancellation here means the wrapper cutoff or an owned internal
abort, not a new HTTP disconnect guarantee (the port has no request signal).
On timeout, premature close, error or cancellation: stop library work,
destroy the owned socket, observe close and settle once; late callbacks may not
send, succeed or create another connection. A cleanup deadline failure is an
explicit sanitized transport failure, never a claim that closure completed.
Physical socket closure, not the library's logical end event, is the oracle.

Success requires the final send callback after a complete post-DATA response,
exact `250` final code and exactly the intended accepted recipient with none
rejected, plus native socket close observed within the cleanup allowance. Earlier RCPT acceptance is insufficient. Do not wait for QUIT to decide
whether already acknowledged DATA was accepted. A disconnect or deadline after
DATA but before that acknowledgement is uncertain: return refusal and apply
compensation, without resending. Relay acceptance is not inbox delivery.

## Invitation delivery is explicitly excluded

Existing invitation consumption can race failure compensation because offers have
no durable pending-delivery eligibility. Password challenges already require
`delivery_state = delivered` in their consuming transaction. This first slice
therefore enables only verification and adds no migration. Invitation and join
approval retain explicit refusing behavior and current compensation regardless
of SMTP configuration. Prove the dispatcher cannot send these purposes through
the configured adapter; test zero relay connections and no usable failed offer.

The separate [invitation eligibility packet](invitation-eligibility.md) records
the required durable gate and predecessor/rollback questions. It is research for
a future reviewed change, not permission to enable those purposes or mark the
organization WBS row complete.

## Proofs and release

Use controlled local TLS fixtures with a dedicated test CA and deterministic
reply choreography. No external relay or inbox is contacted. Verify one message,
one recipient, purpose/body, final ACK, refusal, trickling responses, malformed
replies, TLS name/CA failures, withheld final ACK, early/late close and destruction
before return. Test late callbacks and deliberate resend mutants with counted
connections/messages. Test boot-mounted verification through actual SMTP, then token consumption,
current address/activation refusal and failure compensation. Configured SMTP
invitation/approval tests must instead prove refusal, zero relay connections and
existing compensation. Retain existing process-level one-use proofs.

Each safety slice first demonstrates RED, then GREEN, then a watched production
fault and an adjacent `Proof:`. Local execution remains serial and scoped with
observed RSS; Node heap settings alone are not a Bun memory cap. Full Nx/browser/
Docker/survey runs remain deferred to hosted CI and the canonical h2 gate. WBS
status and external activation remain unchanged.
