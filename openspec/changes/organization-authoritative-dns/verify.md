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

## Pending checks and external acceptance

Independent exact-commit review, hosted CI and the canonical exact-SHA h2 gate are pending. No full local Nx gate, browser suite, production build, live DNS exchange or deployment was run. The graph command only establishes project graph generation. There is no separate core domain-proof unit suite in this tree; existing mounted domain route tests are the core regression path.

Operators must still choose recursive resolvers, authorize UDP/TCP egress and approve a disposable live domain, then attend positive/mismatch/outage/rotation acceptance. Browser authority/organization activation acceptance and automatic retained-proof scheduling remain separate. Local fixtures establish no live-domain ownership, DNSSEC authentication or WBS010.5.4 closure.
