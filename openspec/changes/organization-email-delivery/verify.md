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
