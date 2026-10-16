## Proposed pinned client

Official release [Nodemailer v10.1.2](https://github.com/nodemailer/nodemailer/releases/tag/v10.1.2),
published 2026-10-16T11:18:06Z; inspected exact source
`8454a24ba7ad3b32cca1aed07ae7fc05aa960f19` in
`/tmp/wbs-smtp-nodemailer-review`. This is source research, not a Bun compatibility
or supply-chain certification. No project dependency has yet been added.

The package explicitly exports `nodemailer/lib/smtp-connection`, with maintained
TypeScript source. It provides connect/login/send/close; explicit PLAIN selects
that mechanism without OAuth or alternate authentication fallback. One low-level
connection/send avoids pool resend behavior. Upstream maintains a Bun CI lane;
our Bun 1.4.2 controlled TLS probe remains required.

### Relevant source evidence

Links pin the exact inspected commit; local line numbers are navigational only.

- [Package exports](https://github.com/nodemailer/nodemailer/blob/8454a24ba7ad3b32cca1aed07ae7fc05aa960f19/package.json):
  exported low-level entry, package version, Node >=20 engine and bundled types.
- [SMTP connection](https://github.com/nodemailer/nodemailer/blob/8454a24ba7ad3b32cca1aed07ae7fc05aa960f19/src/smtp-connection/index.ts):
  public `connection`/`secured` options accept an owned TLS socket; `send` settles
  after DATA response. Its parser accepts generic 2xx: the wrapper must demand
  exact final250, one intended accepted recipient and no rejected recipients.
- `close()` unpipes pending message streams and ends/destroys the socket, but its
  graceful-close fallback waits 5s. `_destroy()` emits logical `end` before a
  native close need occur. Own socket destruction/native-close acknowledgement
  and a separate absolute deadline remain necessary.
- [High-level transport](https://github.com/nodemailer/nodemailer/blob/8454a24ba7ad3b32cca1aed07ae7fc05aa960f19/src/smtp-transport/index.ts):
  nonpooled `close()` only disposes OAuth listeners/emits close, so it is not an
  adequate active abort primitive. Do not use a bare sendMail Promise.race.
- [Upstream Bun workflow](https://github.com/nodemailer/nodemailer/blob/8454a24ba7ad3b32cca1aed07ae7fc05aa960f19/.github/workflows/test.yml):
  useful compatibility intent, not fresh local evidence.

### Choice and acceptance probes

The maintained low-level client owns SMTP parsing/framing; our narrow wrapper
owns validated configuration/message shape, TLS identity, total bytes/deadline,
one settlement, destruction and sanitized failures. A handwritten SMTP state
machine duplicates protocol/security work and is not approved. The high-level
client hides active connection lifetime needed by the required deadline.

Before production integration, a focused Bun1.4.2 local TLS probe must demonstrate
public import/types, complete handshake and PLAIN authentication, one final250
submission, refused final ACK, withheld ACK timeout, physical close, no resend,
late callback suppression, immediate220 handoff on a paused owned socket, and
untrusted/wrong-name TLS refusal. The fixture uses
synthetic credentials/token, dedicated CA and no live relay. Any blocker returns
to design review; no private-field fallback or handwritten parser is authorized.

SMTP semantics are grounded in [RFC5321](https://www.rfc-editor.org/rfc/rfc5321.html),
implicit TLS in [RFC8314](https://www.rfc-editor.org/rfc/rfc8314.html), and SMTP AUTH
in [RFC4954](https://www.rfc-editor.org/rfc/rfc4954.html). These sources justify
protocol interpretation, not inbox-delivery claims.

### Inspected source SHA-256

| File at pinned commit        | SHA-256                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| package.json                 | adb6942dfc25ab7755c73ede4aa2d914471ebb4e27e12bbdcb967d7173d52caf |
| src/smtp-connection/index.ts | 01d79d6d67d4c7680f197a1cd72c816c1b77a63d592cc0ae264cc765b8950941 |
| src/smtp-transport/index.ts  | 21f02ae674e5fb8ab10521d47f537ba67e13cba1c4de93dacf864e44e1dcaaa1 |
| .github/workflows/test.yml   | 4941a7d7b7dc5a51613271253ea61240a80d72584669f7f6b8b4c700445ca150 |

### Reply-size limitation found during independent review

At `src/smtp-connection/index.ts:1492–1534`, `maxResponseSize` bounds
unterminated/continued partial buffering; a complete oversized single-line reply
with its newline can bypass that check. Configuring 8KiB therefore does not prove
a complete-reply cap. This design makes only the weaker, honest partial-buffer
claim for that client option. The caller-owned TLS receive boundary independently
counts every plaintext byte across the entire session, capped at 64KiB. A
64KiB+1 complete-one-chunk reply, including an apparently successful final250,
must refuse before success; removing the aggregate guard must fail that oracle.
This is an observed source finding, not yet a locally executed compatibility
proof. No handwritten SMTP decoder is needed for aggregate byte accounting.
