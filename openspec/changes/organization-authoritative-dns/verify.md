# Verification

## Scope

Design packet only, based on `87a2b7edbfaabae889d91daa823f16f520a51cec`.
No production edits, dependency additions, tests, live DNS queries, deployment changes or host gate are included. Implementation and live acceptance remain pending.

## Design checks

Observed 2026-10-16 in the isolated design clone:

- `bun /home/df/wd/puni/puni-00/node_modules/prettier/bin/prettier.cjs --check openspec/changes/organization-authoritative-dns`: all six documents match Prettier.
- `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate organization-authoritative-dns --strict --json`: 1/1 passed, no issues.
- The same pinned OpenSpec CLI with `validate --all --json`: 238/238 passed (220 changes, 18 specs).
- Intent length: 270 whitespace-separated words, below 400.
- `git diff --cached --check`: exit 0, no whitespace errors.

The clone reuses the existing ignored dependency directory for document tools only; no install or lockfile change occurred. Full Nx checks, production tests, R5 fault execution, hosted CI and h2 gate were not run for this documentation-only packet.

## Failure proofs

| Check                  | Injected fault                                                   | Required observing test                                                                                             | Observed result        |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Enabled configuration  | Default invalid/present config or use OS resolver                | `refuses present invalid resolver configuration`; `does not fall back to system DNS`                                | Pending implementation |
| Discovery authority    | Advance after failure; accept another owner/alias                | `does not climb after unresolved discovery failure`; `discovers a delegated verification owner`                     | Pending implementation |
| Network destinations   | Remove IPv4/IPv6/mapped checks or resolve name after validation  | `refuses special-purpose and mapped endpoints`; `pins validated endpoint addresses`                                 | Pending implementation |
| Resource bounds        | Accept excessive sets, cyclic compression or oversized sections  | `rejects oversized authority sets`; `rejects cyclic compression and oversized declared sections`                    | Pending implementation |
| Reply identity         | Remove peer, ID, question, class or opcode checks separately     | `rejects unrelated DNS replies`                                                                                     | Pending implementation |
| Authoritative proof    | Remove AA, owner, alias/referral, negative-SOA checks separately | `requires authoritative exact-owner answers`; `requires SOA for negative evidence`                                  | Pending implementation |
| TXT bytes              | Join separate records, trim or replacement-decode                | `joins only fragments of one TXT record`                                                                            | Pending implementation |
| Truncation/framing     | Accept UDP partial response or malformed TCP length              | `retries truncated UDP using complete TCP`                                                                          | Pending implementation |
| Deadline/cleanup       | Reset total budget; omit abort or close; share request identity  | `shares five seconds across discovery and retries`; `abort closes every owned socket`; concurrency/late-reply tests | Pending implementation |
| Production composition | Omit adapter binding or bypass authority                         | `configured boot verifies through real DNS adapter`; `inactive or unauthorized route sends no packets`              | Pending implementation |
| Modeled failure        | Return empty array on transport failure                          | `distinguishes authoritative absence from outage`                                                                   | Pending implementation |
| Transaction rechecks   | Skip current membership/challenge/owner check separately         | `retains membership and challenge checks after lookup`; `concurrent organizations cannot acquire one domain`        | Pending implementation |

An unchecked or unobserved proof is not complete. Future implementation comments must name the actual injected fault and failing test, not copy a planned claim from this table.

## External acceptance

Pending: configured recursive resolver ownership, outbound UDP/TCP egress, a controlled disposable live domain, attended live lookup/rotation/outage receipts, browser authority/organization activation inventory and acceptance, automatic retained-proof scheduling, hosted CI and canonical exact-SHA h2 gate. Local protocol fixtures establish no live-domain ownership or authenticated DNS claim.
