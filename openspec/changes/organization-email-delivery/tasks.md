## 1. Review the contract and pinned client

- [x] 1.1 Obtain Astra exact review of proposal, design, spec, client evidence and invitation follow-on packet. Approve verification-only scope and explicit refusal of other purposes before production edits.
- [ ] 1.2 Run a disposable Bun1.4.2 controlled TLS compatibility probe of exact Nodemailer10.1.2 public SMTPConnection API, not a live relay. Prove final250/exact recipient, auth none/PLAIN, withheld ACK abort/native close and zero resend. If it fails, return to design review. Pin dependency and lock only after approval/evidence; record upstream source and package integrity.

## 2. Typed configuration and safe purpose dispatch

- [ ] 2.1 TDD `email-delivery-config.test.ts`: absent settings return disabled; each partial/empty/malformed field refuses. Cover absent/unreadable/empty/malformed CA separately. Add parser and boot validation. Watch removed complete-config/CA-read/TLS-identity guards fail the production loader tests and add adjacent Proof comments. Errors must not contain credential/CA source values.
- [ ] 2.2 TDD purpose capture in existing organization harness/controller fixtures before changing the EmailDelivery port/callers to the purpose union. Prove verification purpose; invitation and join approval purpose. TDD configured boot dispatcher refusing invitations with zero relay connections and unchanged revoked/reopened state. Remove dispatch guard and watch that consuming test fail; restore/annotate. No migration.

## 3. Maintained protocol adapter with owned lifetime

- [ ] 3.1 TDD `email-delivery.test.ts` single-recipient grammar, sender, token and fixed-content cases, including CRLF/list/Unicode/invalid token before connect and log/store/response token scans. Implement verification message boundary. Remove recipient/token/header checks or echo raw client error and watch each corresponding consuming oracle fail; restore/annotate.
- [ ] 3.2 TDD local native TLS fixture accepting/refusing authentication and submissions, wrong CA/name, fragmented replies, final250 versus RCPT-only/missing ACK, exact recipient and no rejection. Implement one maintained-client connection/send using caller-owned verified TLS. Watch disabled identity/final-ACK/recipient guards fail; restore/annotate. No transcript logger, high-level pool or service preset.
- [ ] 3.3 TDD absolute deadline, aggregate received-byte cap plus client partial-buffer guard (no complete-reply 8KiB claim), physical closure, bounded failed cleanup, late callbacks/delayed timer callbacks and no resend. Inject shorter fixture budgets, not production default changes. Watch timer renewal/cap omission/logical-end-as-close and duplicate-send faults fail named production-path tests; restore/annotate. Include a complete one-chunk 64KiB+1 reply, including final250, and watch omitted aggregate guard fail. Observe socket/message/connection counts and RSS; no bare Promise.race with live work.

## 4. Production composition and verification lifecycle

- [ ] 4.1 TDD `boot-email-delivery.db.test.ts` against real controlled TLS: boot issues a challenge, captures code, confirms once under the same user ID, refuses replay/current address conflicts; inactive/non-password callers send nothing. Wire loadConfig, both process entrypoints and BootOptions without replacing repository authority. Replace boot binding with refusing sink and watch success case fail; restore/annotate.
- [ ] 4.2 TDD boot-mounted rejection/uncertain DATA/cleanup failure: challenge failed, captured code unusable, no hidden resend, no raw secret leakage. Inject compensation-store failure and require server failure. Watch false success/omitted recordDelivery/compensation swallowing fail; restore/annotate. Re-run existing focused verification/invitation/join controller suites serially to retain authority/compensation/one-use cases.

## 5. Evidence and release boundary

- [ ] 5.1 Write operator configuration/disabled/refusal runbook and symbol JSDoc. Record missing external relay credentials, CA/sender authority and live inbox proof; keep WBS010.5.4 open and invitation eligibility separate.
- [ ] 5.2 Run serial scoped tests, lint/typecheck/format/OpenSpec and normal hooks; report every unavailable/skipped check and observed RSS. Request Astra exact source review before push. Hosted exact CI and canonical h2 gate remain release requirements; no local full Nx/browser/Docker/Burokrat or live SMTP activation.
