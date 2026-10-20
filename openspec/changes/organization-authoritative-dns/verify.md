# Verification

## Scope

Implementation is stacked on reviewed design head `a226ed0eb11b4fac378bb1907fe9ebee54b974c5`, tree `762fc7198f7418e8b5d54521e8321b3e4969d2d1`, whose parent is `87a2b7edbfaabae889d91daa823f16f520a51cec`. Work used an isolated `/tmp` clone; the shared checkout was not edited.

The private be-01 adapter, explicit configuration, native socket transport and boot binding are implemented. Existing HTTP/domain ports, activation policy, ownership transaction and persistence schema are unchanged. The codec framing and cleanup amendments are recorded in `design.md` and the delta spec. WBS completion and external acceptance remain pending.

## Dependency review

A frozen Bun install completed before implementation. Exact `dns-packet@5.6.1`, development `@types/dns-packet@5.6.5` and locked transitive `@leichtgewicht/ip-codec@2.0.5` were installed through Bun. Source, declaration gaps and MIT licenses were read. The alternative `dns-message@1.1.1` was rejected: it accepted cyclic compression and an excessive expanded name.

The selected codec alone loses embedded-dot label identity, allocates section arrays before rejecting excessive counts, and permits an NS name to cross RDLENGTH. The adapter's narrow preflight is therefore mandatory. Its count test observes that `packet.decode` is never invoked before rejecting a validly framed 257-record packet. It bounds names before low-level decode and every supported RDATA decoder before full decode.

`bun /tmp/puni-dns-adapter-sol/openspec/changes/organization-authoritative-dns/codec-review/reproduce.mjs`, run from a disposable directory with exact candidate dependencies, exited 0 and reproduced all six characterization assertions. Source SHA-256 values matched:

- dns-packet index: `dd9d08eac52a0dc5f8214ab188b661bb66b20acaa02e1e812e0400d588aaefd3`.
- dns-message module: `360ee1afdd9f256eb3ec1673e1ab8f5ba618ae7a4fa9a0db7f114e428c08f51a`.

## Recursive-discovery design review correction (historical packet)

Prepared locally against public PR #560 head `66dd75843666260197a8bd8231b7315c7becde83` (tree `8330703cbc93b282f34f32523b4c90ccee3bb092`) on 2026-10-16. The P2 referral finding is addressed in the design, delta spec and task 2: recursive positive records must be matching IN answer records; supported terminal negatives require enclosing authority-section IN/SOA evidence without aliases or contradictions. Referrals, incomplete replies and unsupported SOA-less negatives fail over at the same owner/type, then throw without ancestor fallback or direct TXT queries when unresolved. This includes NS and both address families.

Observed in `/tmp/puni-dns-referral-design-oct16`:

- Exact public head fetched read-only over HTTPS; initial sandbox fetch could not resolve GitHub, then the authorized network fetch succeeded.
- OpenSpec 1.12.0 `status --change organization-authoritative-dns --json`: `sdd-lean`, all five planning artifacts present, planning complete; all implementation task boxes remain open.
- `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate organization-authoritative-dns --strict --json`: 1/1 passed, no issues.
- The same CLI with `validate --all --json`: 241/241 passed (223 changes, 18 specs).
- Final changed-packet Prettier `--check`: all matched files use Prettier code style. `git diff --check`: exit 0 with no whitespace errors. Only design, delta spec, tasks and this verification record differ from the public head; the other two packet files are unchanged.
- Initial formatting could not resolve the existing Tailwind plugin in the scratch clone. Linking the existing ignored `node_modules` for document tooling allowed Prettier to format the packet; no install or dependency change occurred. Direct execution from the Bun package cache was also unavailable because its dependency resolution attempted a read-only temporary location; the existing complete OpenSpec 1.12.0 tool directory above succeeded.

That design-only packet ran no production source, DNS packet exchange, implementation test or watched fault. The implementation receipts below supersede its pending discovery proof. WBS010.5.4 and parent task 5.2 remain open. No source push, hosted CI rerun, full Nx checks or canonical h2 gate is included in this local correction.

## Failure proofs

| Check                  | Injected fault                                                           | Required observing test                                                                                             | Observed result                                    |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Enabled configuration  | Default invalid/present config or use OS resolver                        | `refuses present invalid resolver configuration`; `does not fall back to system DNS`                                | Earlier 90 receipts below                          |
| Discovery authority    | Advance after failure; accept another owner/alias                        | `does not climb after unresolved discovery failure`; `discovers a delegated verification owner`                     | Earlier 90 receipts below                          |
| Recursive discovery    | Remove terminal-negative SOA, answer-section collection or SOA enclosure | `requires terminal negatives for recursive discovery` NS/A/AAAA matrix                                              | Three watched exit-1 faults; restored suite passes |
| Network destinations   | Remove IPv4/IPv6/mapped checks or resolve name after validation          | `refuses special-purpose and mapped endpoints`; `pins validated endpoint addresses`                                 | Earlier 90 receipts below                          |
| Resource bounds        | Accept excessive sets, cyclic compression or oversized sections          | `rejects oversized authority sets`; `rejects cyclic compression and oversized declared sections`                    | Earlier 90 receipts below                          |
| Reply identity         | Remove peer, ID, question, class or opcode checks separately             | `rejects unrelated DNS replies`                                                                                     | Earlier 90 receipts below                          |
| Authoritative proof    | Remove AA, owner, alias/referral, negative-SOA checks separately         | `requires authoritative exact-owner answers`; `requires SOA for negative evidence`                                  | Earlier 90 receipts below                          |
| TXT bytes              | Join separate records, trim or replacement-decode                        | `joins only fragments of one TXT record`                                                                            | Earlier 90 receipts below                          |
| Truncation/framing     | Accept UDP partial response or malformed TCP length                      | `retries truncated UDP using complete TCP`                                                                          | Earlier 90 receipts below                          |
| Deadline/cleanup       | Reset total budget; omit abort or close; share request identity          | `shares five seconds across discovery and retries`; `abort closes every owned socket`; concurrency/late-reply tests | Earlier 90 receipts below                          |
| Production composition | Omit adapter binding or bypass authority                                 | `configured boot verifies through real DNS adapter`; `inactive or unauthorized route sends no packets`              | Earlier 90 receipts below                          |
| Modeled failure        | Return empty array on transport failure                                  | `distinguishes authoritative absence from outage`                                                                   | Earlier 90 receipts below                          |
| Transaction rechecks   | Skip current membership/challenge/owner check separately                 | `retains membership and challenge checks after lookup`; `concurrent organizations cannot acquire one domain`        | Earlier 90 receipts below                          |

These are dependency evidence, not implementation proof. The executable repro is preserved beside [the fault receipts](codec-review/fault-receipts.json). Address policy uses the dated IANA registries documented in [the resolver runbook](../../../docs/runbook-organization-dns.md).

## Focused execution

Observed 2026-10-16, serially with Bun 1.4.2:

| Command                                                                                                                                                                         | Observed result                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `bun test apps/wbs/be-01/src/runtime/authoritative-dns apps/wbs/be-01/src/authoritative-dns.boot.db.test.ts apps/wbs/be-01/src/config.test.ts`                                  | 190 passed, 0 failed, 6 files; 10.42s              |
| `bun test apps/wbs/be-01/src/controller/domain-organization.controller.db.test.ts apps/wbs/be-01/src/boot-browser-session.db.test.ts`                                           | 58 passed, 0 failed                                |
| `bun test apps/wbs/be-01/src/boot.db.test.ts` with local socket permission                                                                                                      | 31 passed, 0 failed; 7.06s                         |
| `GOMEMLIMIT=384MiB timeout 45s bun node_modules/@typescript/native/bin/tsc --noEmit --project apps/wbs/be-01/tsconfig.lib.json`                                                 | Exit 0                                             |
| Same capped typecheck with `tsconfig.spec.json`                                                                                                                                 | Exit 0 after typed dependency spies were corrected |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NODE_OPTIONS=--max-old-space-size=512 timeout 40s bunx nx graph --file=/tmp/puni-dns-codec-review/project-graph.json --view=projects` | Exit 0; graph generated, no full target run        |

The combined existing domain/browser-boot/socket-boot regression attempt initially reported 63 passed/26 failed because the sandbox denied native listeners with `EPERM: listen`. The socket boot file was rerun with the required permission and passed 31/31. The independent domain/browser-boot rerun passed. Focused checks do not imply the full host gate passed.

Initial RED receipts included the missing resolver, codec and transport, absent boot binding (configured proof returned 503), misplaced authority TXT with enclosing SOA accepted as absence, raw caller abort text escaping, delayed work timer allowing another exchange, abrupt TCP closure awaiting a second close event, closure timeout failing to settle, and errors arriving during closure being ignored. Their restored controls passed. Codec mutation trials exposed two weak fixtures (incomplete excessive-count packet and MX rejected by another RDATA check); fixtures were replaced with valid excessive framing and a dispatch-compatible PTR payload before recording the final receipts. The trusted-codec corruption spy now preserves `decode.bytes`, so its test reaches the UTF-8 boundary.

## Static and document checks

- `NODE_OPTIONS=--max-old-space-size=512 timeout 45s bun node_modules/eslint/bin/eslint.js` over the adapter folder, mounted DNS test, changed boot/config/main/helper files and executable codec repro: exit 0, no warnings. The generated Nx graph allowed module-boundary checks to run.
- Changed-file `bun node_modules/prettier/bin/prettier.cjs --check`: exit 0. `LLM_README.md` is 140 lines.
- `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate organization-authoritative-dns --strict --json`: 1/1 valid, no issues.
- The same installed pinned CLI with `validate --all --json`: 238/238 valid (220 changes, 18 specs).
- `git diff --check`: exit 0.
- First commit attempt: repository pre-commit format/doc-caps/secrets/private-nesting/tool-wiki passed; Node-based hook ESLint reached the explicit 512MiB heap cap and refused the commit. The scoped Bun ESLint receipt above remains valid; commit was retried with a bounded 1GiB Node heap, without bypassing hooks.

## R5 execution

[90 serial fault receipts](codec-review/fault-receipts.json) name the precise source mutation, focused Bun command, nonzero exit and observed failed test. Every edit was restored in `finally`. The recorder rejected syntax errors, external timeout exits and Bun timeout failures; a timeout was not accepted as proof. Adjacent production `Proof:` comments refer to the observed failures. Existing store guards retain their original comments and now have additional mounted adapter-path receipts.

| Boundary                      | Independently observed faults                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packet allocation and framing | Packet size, question/RR/name/pointer/label spans, count allocation, type dispatch, raw question/RR class, trailing bytes, exact NS/SOA/address/TXT spans, packet/name codec consumption                                    |
| Compression and identity      | Known prior name targets, pointer hop/work caps, expansion bound, embedded-dot owner identity, escaped mailbox pointer identity; valid compressed and mailbox controls remain                                               |
| Configuration/destinations    | Bare-IP validation, configured count/distinctness, IPv4/mapped and IPv6 classification, authority and endpoint cardinality; no OS resolver or glue path exists                                                              |
| Discovery and proof           | Routing alias/owner/NS identity/rcode/NXDOMAIN/absence; peer/port/ID/QR/opcode/question/type; authoritative AA/rcode/NXDOMAIN/alias/owner/SOA; misplaced authority and additional TXT each with a valid SOA control         |
| TXT bytes                     | Fatal UTF-8 in wire and corrupted codec output, preserved BOM, separate-record join refusal through mounted boot                                                                                                            |
| Lifetime                      | Caller abort sanitization, delayed clock cutoff, attempt and shared lookup deadlines, terminal cleanup error precedence, bounded/absolute cleanup join, UDP and TCP acknowledgment before settlement, closing error refusal |
| Native transport              | Numeric destination before socket creation, outgoing packet bounds, TCP buffer/frame spans and required peer metadata                                                                                                       |
| Production/transaction        | Omitted binding, resolver bypass, empty-on-error, activation bypass; commit membership, activation, challenge, expiry snapshot and expiry time; removed unique owner index allowed two concurrent 200 responses             |

The restored suite covers deferred close acknowledgment, late events after cleanup failure, no proof until closure, timed-out peer retry only after acknowledgment, shared UDP/TCP attempt identity, late TC fallback without resetting deadlines, concurrent crossed replies, and a mounted near-4,800ms cancellation returning 503 after joined cleanup and before the unchanged five-second route guard. Native socket behavior is exercised with controlled socket factories, not live DNS. The mounted protocol fixtures preserve the production adapter, codec, boot wiring, signed browser context, activation reader and disposable SQLite transaction.

## Exact review correction after c9c1bd552

Independent review found a publication gap: a synchronous decoder could cross the absolute cutoff after the exchange's pre-decode clock read, or caller cancellation could be queued before the final await resumed. Four production-path cases first returned `['proof-A', 'other']` instead of rejecting. Expanded RED covered eight cases: packet/text conversion crossing the shared cutoff, synchronous caller abort, queued shared cutoff/caller abort, and local attempt cutoff/cancellation during TXT conversion. All eight failed before the fix (0 passed/8 failed).

The private exchange now accepts a synchronous conversion callback, so routing validation and TXT conversion finish before its final attempt cutoff/cancellation checks. Lookup rechecks the shared cutoff and cancellation after awaiting accepted values, before publishing. Socket cleanup/error precedence is unchanged. A positive 899ms conversion control still succeeds.

- Restored focused DNS/config/mounted command from the table above: **199 passed, 0 failed**, 6 files, 10.29s.
- Independently removed decoded-work cutoff, decoded-attempt abort check, publication cutoff and publication abort check: each focused test failed with proof strings returned instead of an error, exit 1, without timeout. The four receipts extend the earlier 86 to 90; all edits were restored.
- Refreshed both 384MiB/45s-capped lib/spec typechecks and scoped resolver/test ESLint: exit 0. Changed-document strict OpenSpec: 1/1 valid; all OpenSpec: 238/238 valid. The earlier 58/31 regression receipts belong to the initial implementation candidate and were not repeated for this resolver-only correction.
- Raw RED/GREEN/fault logs remain in `/tmp/puni-dns-codec-review/publication-*.log` and `fault-{decoded-work-deadline,decoded-attempt-abort,proof-publication-deadline,proof-publication-abort}.log` for local exact-review inspection.

## Hosted CI classification repair

Hosted run `38912457392`, Twilight job `117011601042`, stopped 11 reviewed pilot cases because `codec-review/reproduce.mjs` matched both the `openspec` prefix and the `source` `.mjs` suffix. It is the only tracked JavaScript/TypeScript file under `openspec/`; no source boundary selects it. Both repository policies now exclude the `openspec` prefix from source classification, matching their existing document/config exclusions. The classifier and its multiple-match refusal are unchanged.

The new production CLI tests first failed in both policy copies with `matched 2 classification rules` (2 passed, 2 failed), then passed after the exclusions (4 passed, 0 failed). They retain runtime `.mjs` source membership and classify the OpenSpec script without executing it. Injecting the overlap by removing the exclusion is refused in both copies. Temporarily weakening the production ambiguity guard from `> 1` to `> 2` made both injected-overlap negatives fail with expected exit 1, received 0; the guard was restored before validation. Raw receipts are `/tmp/dns-classification-{red,green,overlap-fault}.log`.

Serial checks after this repair:

- `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test apps/twilight-structure/twilight-burokrat/cli/src/inventory/classification.test.ts apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000`: 44 passed, 0 failed, 674 assertions, 120.89s. The external mapping absence/unreadability, selector mismatch and ambiguity negatives passed. Receipt: `/tmp/dns-ci-policy-focused.log`.
- Scoped ESLint with `NODE_OPTIONS=--max-old-space-size=512` and changed-file Prettier: exit 0.
- Pinned OpenSpec 1.12.0 strict DNS change validation: 1/1 valid; all-spec validation: 238/238 valid. Receipts: `/tmp/dns-ci-openspec-{change,all}.log`.
- No additional typecheck, full Nx, solver, browser, build, host gate, live DNS or deploy was run for this policy-only repair. Hosted CI still needs to judge the successor commit.

## Pending checks and external acceptance

Independent exact-commit review, hosted CI and the canonical exact-SHA h2 gate are pending. No full local Nx gate, browser suite, production build, live DNS exchange or deployment was run. The graph command only establishes project graph generation. There is no separate core domain-proof unit suite in this tree; existing mounted domain route tests are the core regression path.

Operators must still choose recursive resolvers, authorize UDP/TCP egress and approve a disposable live domain, then attend positive/mismatch/outage/rotation acceptance. Browser authority/organization activation acceptance and automatic retained-proof scheduling remain separate. Local fixtures establish no live-domain ownership, DNSSEC authentication or WBS010.5.4 closure.

## Recursive-discovery implementation correction (2026-10-16)

Local isolated clone `/tmp/puni-dns-referral-impl-sol-oct16` merges adapter head `5bc9c2b550f312ef5c4b8f2f0097752e43b66978` with corrected design head `07b4c29bd891c5460b0b01ff04fedd1a1da172cd`. Only `tasks.md` and `verify.md` conflicted: retain completed adapter slices and historical receipts, replace discovery slice 2 with the corrected requirements and complete it only after the evidence below. Other changes from the design head's newer main ancestry are inherited merge content, not newly implemented or independently verified here. No existing source checkout was edited; ignored dependencies link to the adapter clone's installed tree.

`readRoutingRecords` now refuses an empty answer section without enclosing authority-section SOA. The packet boundary already requires raw IN class for every record, and the existing classifier rejects aliases, contradictory NXDOMAIN answers and wrong answer owners/types. The existing recursive loop therefore retries the same owner/type, then throws when unsupported evidence remains unresolved. No other routing, transport, boot or persistence behavior changed. The answer-section-only return remains explicit. Test fixtures that intend terminal absence now carry valid SOA evidence, including shared-deadline and mounted cleanup fixtures.

- Initial encoded RED matrix: 25 pass, 24 fail, exit 1 (`/tmp/dns-referral-red.log`), before production changes. Referrals, SOA-less negatives and misplaced/non-enclosing SOAs incorrectly progressed.
- Restored focused DNS/config/mounted command: `bun test apps/wbs/be-01/src/runtime/authoritative-dns/{referral,resolver,packet,transport,addresses}.test.ts apps/wbs/be-01/src/authoritative-dns.boot.db.test.ts apps/wbs/be-01/src/config.test.ts`: **257 pass, 0 fail**, 7 files; maximum RSS 567,224 KiB (`/tmp/dns-referral-focused.log`). The new matrix contributes 58 tests. It covers NS/A/AAAA incomplete packets, referrals, absent/wrong-section/wrong-class/non-enclosing SOA, aliases, contradictions, misplaced/wrong-owner/wrong-class positives, later resolver positives and NODATA/NXDOMAIN, one absent address family and both absent families. Exhausted discovery assertions inspect exact request owner/type/resolver order and zero direct TXT/ancestor-fallback packets after the unresolved query.
- Three watched production-path mutations each exited 1 without syntax error or timeout: remove terminal-negative SOA classification; gather positive records from authority/additional sections; remove SOA enclosure. [Exact mutation receipts](codec-review/referral-fault-receipts.json) and `/tmp/dns-referral-fault-{terminal-negative,answer-section,enclosing-soa}.log` record failures. Every source mutation was restored in `finally`; adjacent `Proof:` comments name the observations.
- Scoped native lib and spec typechecks passed with `GOMAXPROCS=2 GOMEMLIMIT=384MiB timeout 45s bun node_modules/@typescript/native/bin/tsc --noEmit --project apps/wbs/be-01/tsconfig.{lib,spec}.json`. The first spec attempt caught a readonly `it.each` input and an overly wide answer helper return type; both were corrected. Native peak RSS exceeded the nominal Go memory cap: final observed lib 1,900,252 KiB and spec 1,676,756 KiB. Typecheck processes briefly overlapped while polling; this is not a serial typecheck receipt. Tests and fault trials ran one Bun process at a time. Free-memory snapshots stayed above 19GiB available on this 32GiB environment; no claim of a hard process memory cap is made.
- Scoped graph generation passed (no target execution), maximum RSS 255,172 KiB. Scoped ESLint covers the five changed TypeScript files. The initial lint found Bun's non-Promise `.rejects` matcher typing in the new test; the rejection assertion now uses the existing suite's explicitly awaited catch pattern.
- Pinned OpenSpec 1.12.0 strict change validation passed 1/1; all validation passed 241/241 (223 changes, 18 specs). The all-validation output retains pre-existing archive advisory warnings; validation does not establish archive readiness.

Architecture risk remains the explicit recursive routing trust boundary and narrower supported DNS response policy. Legitimate SOA-less negatives are unavailable by design. This correction adds no alias following or glue consumption. Full host gate, hosted CI, live DNS, deployment, operator resolver/egress configuration, controlled-domain acceptance, activation and retained-proof scheduling remain unrun or pending. WBS010.5.4 and parent task 5.2 remain open. Exact-SHA independent review is requested separately after the local commit.

Final pre-commit receipts: scoped ESLint exited 0 (maximum RSS 1,327,288 KiB); all ten touched DNS source/packet files passed Prettier; staged and unstaged `git diff --check` exited 0. After the final test typing/lint correction, the 58-case referral matrix passed again, 0 failures (`/tmp/dns-referral-final.log`). No additional typecheck ran after the final catch-assertion cleanup; prior lib/spec receipts precede that test-only edit. This fresh clone contains only sample Git hooks, so no installed repository pre-commit hook is claimed; the scoped executable checks above were run directly. No hook bypass flag was used.

## Source and merge reconciliation — 2026-10-19

[The parent reconciliation](../organization-ownership-and-access/verify.md#source-and-merge-reconciliation--2026-10-19)
verifies that PR #562 head `0f6f8f279`, its classification repair `5bc9c2b55`
and recursive-negative correction `e9fbd7675` are already in main through
PR #565. Current `bootBe01` binds the configured authoritative resolver; the
older open PR is not an unimplemented adapter or outstanding classification fix.
Earlier pending-publication statements retain their checkpoint meaning.

Task 7 and live acceptance remain open: recursive resolver selection, UDP/TCP
egress, a controlled disposable domain and attended positive/mismatch/outage/rotation
evidence. Scheduling source has also landed; its live observation and
organization/browser activation are separate obligations. This source-only
reconciliation reruns none of the historical tests or release gates.
