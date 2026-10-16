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

## Recursive-discovery review correction

Prepared locally against public PR #560 head `66dd75843666260197a8bd8231b7315c7becde83` (tree `8330703cbc93b282f34f32523b4c90ccee3bb092`) on 2026-10-16. The P2 referral finding is addressed in the design, delta spec and task 2: recursive positive records must be matching IN answer records; supported terminal negatives require enclosing authority-section IN/SOA evidence without aliases or contradictions. Referrals, incomplete replies and unsupported SOA-less negatives fail over at the same owner/type, then throw without ancestor fallback or direct TXT queries when unresolved. This includes NS and both address families.

Observed in `/tmp/puni-dns-referral-design-oct16`:

- Exact public head fetched read-only over HTTPS; initial sandbox fetch could not resolve GitHub, then the authorized network fetch succeeded.
- OpenSpec 1.12.0 `status --change organization-authoritative-dns --json`: `sdd-lean`, all five planning artifacts present, planning complete; all implementation task boxes remain open.
- `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate organization-authoritative-dns --strict --json`: 1/1 passed, no issues.
- The same CLI with `validate --all --json`: 241/241 passed (223 changes, 18 specs).
- Final changed-packet Prettier `--check`: all matched files use Prettier code style. `git diff --check`: exit 0 with no whitespace errors. Only design, delta spec, tasks and this verification record differ from the public head; the other two packet files are unchanged.
- Initial formatting could not resolve the existing Tailwind plugin in the scratch clone. Linking the existing ignored `node_modules` for document tooling allowed Prettier to format the packet; no install or dependency change occurred. Direct execution from the Bun package cache was also unavailable because its dependency resolution attempted a read-only temporary location; the existing complete OpenSpec 1.12.0 tool directory above succeeded.

No production source, DNS packet exchange, implementation test or watched fault was run. The new recursive-discovery fault row remains pending; it records planned evidence, not an observed proof. WBS010.5.4 and parent task 5.2 remain open. No source push, hosted CI rerun, full Nx checks or canonical h2 gate is included in this local correction.

## Failure proofs

| Check                  | Injected fault                                                                                         | Required observing test                                                                                             | Observed result        |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Enabled configuration  | Default invalid/present config or use OS resolver                                                      | `refuses present invalid resolver configuration`; `does not fall back to system DNS`                                | Pending implementation |
| Discovery authority    | Advance after failure; accept another owner/alias                                                      | `does not climb after unresolved discovery failure`; `discovers a delegated verification owner`                     | Pending implementation |
| Recursive discovery    | Treat authority NS/no SOA as absence; remove terminal-negative SOA or answer-section guards separately | `does not treat recursive referrals as absence`; `requires terminal negatives for recursive discovery`              | Pending implementation |
| Network destinations   | Remove IPv4/IPv6/mapped checks or resolve name after validation                                        | `refuses special-purpose and mapped endpoints`; `pins validated endpoint addresses`                                 | Pending implementation |
| Resource bounds        | Accept excessive sets, cyclic compression or oversized sections                                        | `rejects oversized authority sets`; `rejects cyclic compression and oversized declared sections`                    | Pending implementation |
| Reply identity         | Remove peer, ID, question, class or opcode checks separately                                           | `rejects unrelated DNS replies`                                                                                     | Pending implementation |
| Authoritative proof    | Remove AA, owner, alias/referral, negative-SOA checks separately                                       | `requires authoritative exact-owner answers`; `requires SOA for negative evidence`                                  | Pending implementation |
| TXT bytes              | Join separate records, trim or replacement-decode                                                      | `joins only fragments of one TXT record`                                                                            | Pending implementation |
| Truncation/framing     | Accept UDP partial response or malformed TCP length                                                    | `retries truncated UDP using complete TCP`                                                                          | Pending implementation |
| Deadline/cleanup       | Reset total budget; omit abort or close; share request identity                                        | `shares five seconds across discovery and retries`; `abort closes every owned socket`; concurrency/late-reply tests | Pending implementation |
| Production composition | Omit adapter binding or bypass authority                                                               | `configured boot verifies through real DNS adapter`; `inactive or unauthorized route sends no packets`              | Pending implementation |
| Modeled failure        | Return empty array on transport failure                                                                | `distinguishes authoritative absence from outage`                                                                   | Pending implementation |
| Transaction rechecks   | Skip current membership/challenge/owner check separately                                               | `retains membership and challenge checks after lookup`; `concurrent organizations cannot acquire one domain`        | Pending implementation |

An unchecked or unobserved proof is not complete. Future implementation comments must name the actual injected fault and failing test, not copy a planned claim from this table.

## External acceptance

Pending: configured recursive resolver ownership, outbound UDP/TCP egress, a controlled disposable live domain, attended live lookup/rotation/outage receipts, browser authority/organization activation inventory and acceptance, automatic retained-proof scheduling, hosted CI and canonical exact-SHA h2 gate. Local protocol fixtures establish no live-domain ownership or authenticated DNS claim.
