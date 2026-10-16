## Planning status

Base main `87a2b7edbfaabae889d91daa823f16f520a51cec` in isolated
`/tmp/wbs-organization-smtp-sol`; no production/dependency/schema edits yet.
PM selected password-verification-only scope. SMTP invitation/join delivery
remains explicitly disabled even when verification SMTP is configured.

Read the email port, three route callers, production/dev entrypoints, boot/config,
verification/invitation/join repositories and mounted tests. Client source
inspection is recorded in [client review](client-review.md). Upstream Bun CI is
not local compatibility evidence. Astra exact artifact review found one P2 client-boundary overclaim: maxResponseSize does not bound complete one-chunk replies. Revised to wrapper-owned aggregate64KiB plus honest client partial-buffer8KiB; clarification corrections cover final250 versus accepted[] recipient identity and absolute clock checks. Independent Astra exact design review reports no remaining P0–P3 findings; approved to commit the planning packet and run the disposable client probe. Runtime compatibility and production implementation remain unproven.

## Planned commands

Run serially with RAM observation, no broad local process overlap. Use Bun1.4.2,
`NODE_OPTIONS=--max-old-space-size=768` where applicable; this is a Node heap cap,
not a hard Bun RSS limit. Do not claim the latter.

- Disposable native TLS maintained-client probe: pending design approval.
- `bun test apps/wbs/be-01/src/runtime/email-delivery-config.test.ts`: pending implementation.
- `bun test apps/wbs/be-01/src/runtime/email-delivery.test.ts`: pending implementation.
- `bun test apps/wbs/be-01/src/boot-email-delivery.db.test.ts`: pending implementation.
- Existing email-verification/invitation/join-request controller suites: pending implementation.
- Scoped ESLint/TypeScript/Prettier and OpenSpec: planning artifacts: OpenSpec1.12.0 strict validation passed (`Change organization-email-delivery is valid`), Prettier write completed and git diff --check passed on 2026-10-16. No runtime claims follow from these checks.
- Normal hooks: pending planning commit.
- Full Nx, browser, Docker, Burokrat survey, canonical h2 gate: not run locally; outside this planning checkpoint.
- Hosted exact source CI, deployment, real relay/inbox: not run; release/external evidence remains pending.

## Failure-proof table

No safety check is implemented or proven yet. These are required watched faults,
not completed evidence; tasks remain unchecked until fresh RED/GREEN/negative receipts.

| Check                                 | Injected fault                                                        | Required observing test                                           | Outcome |
| ------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- | ------- |
| Explicit complete configuration/trust | Omit pair/required-field/read/parse checks; missing and unreadable CA | production config/boot refusal                                    | Pending |
| Invitation remains disabled           | Route invitation purpose to enabled SMTP                              | configured boot invitation/join zero-connections and compensation | Pending |
| One recipient and safe content        | Remove mailbox/token guard; allow header injection/raw error          | adapter grammar and leakage oracles                               | Pending |
| Verified TLS                          | Disable CA/name verification                                          | real TLS wrong-CA/name before auth/body                           | Pending |
| Final acceptance                      | Treat RCPT or body write as success                                   | withheld final ACK and unusable captured code                     | Pending |
| Exact recipient                       | Ignore accepted/rejected response shape                               | wrong/multiple recipient adapter case                             | Pending |
| Absolute deadline and byte caps       | Renew timer or omit receive cap                                       | trickle/complete-one-chunk64KiB+1 bounded abort                   | Pending |
| Native close and no resend            | Substitute library end; omit destroy; duplicate send                  | native-close/late-callback/counting cases                         | Pending |
| Boot binding                          | Bind refusing adapter despite valid config                            | boot-mounted verification success                                 | Pending |
| Failed delivery compensation          | Mark delivered, omit failed state or swallow store error              | captured token cannot confirm / storage failure propagates        | Pending |
| Current authority and one use         | Bypass existing activation/address/consume predicate                  | mounted current-address/replay/authority cases                    | Pending |

## Disposable maintained-client probe

Planning packet committed with normal hooks as
`f3bd6a1d68dd640114e69631f151b8e0d694e5e4`, tree
`a9495ade87877cf9c7019518f614ce493a95a1aa`. Astra approved the exact design
(no remaining P0–P3) before the probe/production TDD began.

Bun1.4.2 installed exact Nodemailer10.1.2 into the separate disposable
`/tmp/wbs-smtp-client-probe`; no production dependency was added in this checkpoint.
Package integrity:
`sha512-rnQn9Rzh8RAwcp42MVsIvxbsv6YZ2a2/av+uyJ/LPU1+2QSlrRgFsWWZTKenyRUqkIl8urOI0c4+CEcmFdsvQw==`.
Probe source SHA-256:
`4d4af422e8ec56190ff9edccc57c22948e55401f9c92e0705f864dfef0cb6a2a`.

`bun test ./probe.test.ts --timeout 5000` passed **9 tests, 43 assertions,
586ms**, peak RSS **48,556KiB** (`/tmp/smtp-client-probe.log`). Controlled native
TLS fixtures cover immediate220 paused-socket handoff, explicit none/PLAIN,
final250/native close, final550 and withheld ACK without resend, synthetic
complete one-chunk overflow/expired input before the same event's later parser
listener, fragmented input refusal and wrong CA/name before credentials/body.
The fragmented case can hit the client's partial guard before the aggregate
limit; it is not yet a production aggregate-fragmentation proof.

Watched disposable faults: removing the aggregate guard changed expected overflow
to deadline (`/tmp/smtp-probe-fault-byte-cap.log`); omitting transition clock
checks changed expected deadline to cleanup (`/tmp/smtp-probe-fault-clock.log`).
Restored probe bytes match the hash above. These prove the feasibility boundary,
not production R5 completion. Initial sandbox loopback binding failed
(`/tmp/smtp-client-probe-sandbox.log`); an approved elevated loopback run passed.
No external relay or credentials were used.

## Configuration TDD checkpoint

New parser/config-loader tests first failed for the absent module/binding
(`/tmp/smtp-config-red.log`, `/tmp/smtp-config-load-red.log`). Restored focused
configuration suites passed **65 tests, 97 assertions, 284ms**
(`/tmp/smtp-config-restored.log`). Native CA fixtures are generated with the
required local `openssl` tool; tests do not embed production keys or certificates.

Twenty watched production-parser faults each exited1 in the serial runner
(`/tmp/smtp-config-faults.log` and `/tmp/smtp-config-fault-<name>.log`):
absent-mode handling, required values, host, port, TLS mode, server name, EHLO,
sender, credentials under none, credential bounds, unknown auth mode, absolute CA
path, actual CA read, DER parsing, DNS total length/FQDN, mailbox/local-part
length, raw-error sanitization and extra bytes outside PEM. Adjacent Proof
comments name their consuming loader cases. An initial relative-path mutant
survived because its fixture file was missing; the corrected fixture reaches a
valid CA through a relative path and removing the guard now fails. Missing,
unreadable, empty, malformed PEM/DER and extra-byte CA cases remain distinct.

Scoped ESLint passed after formatting/type-safe array access cleanup, with
`@nx/enforce-module-boundaries` explicitly skipped because the isolated checkout
has no cached graph (`/tmp/smtp-config-lint.log`). A narrow standalone TypeScript
check of the two new runtime config files passed with `--ignoreConfig --types
bun-types --strict --skipLibCheck` (`/tmp/smtp-config-tsc.log`); the initial
`--types bun` invocation could not find that definition and was corrected to the
repository's actual bun-types package. This is not project-wide typecheck.

Transport, boot dispatch and mounted SMTP lifecycle remain unimplemented; no
runtime delivery or WBS completion is claimed by this checkpoint.
