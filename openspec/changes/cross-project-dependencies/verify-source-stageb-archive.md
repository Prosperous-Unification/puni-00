# Stage B A1 private archive source evidence

This is the required A1 member/index/serialization portion of A, implementing the
privately adopted 2026-10-25 ruling. It does not complete A, the provider, physical
Stage B, parent 10.2 or the architecture/main-merge hold. I/B/K/P/O/A2/R remain
required. No authenticated input, measured result, encryption, publication,
recipient selection or cleanup authority is produced.

## Actual container and boundaries

The five closed synchronous APIs retain copied ordinary non-shared byte views in a
private original-token WeakMap. All fifteen fixed slots close explicitly; members
serialize in slot order and append ordinal order. Index rows hash original decoded
bytes. Compact index JSON has no terminal LF; the envelope has exactly one. Its
index excludes itself and ciphertext. Claims are detached and frozen, syntactically
checked only. A coherently substituted input digest and payload passes the local
exact-byte equality check: that is deliberately not authenticity.

The output is a mutable detached Uint8Array marked `private-serialized`. A2 must
hash the exact bytes it consumes again. No replay decoder mints tokens. A failed
mutation poisons the collector; discard and final serialization release retained
member references. Discard promises no secure erasure. Fixed private errors expose
no request/member values. Descriptor-only closed records reject unknown, symbol,
accessor and non-ordinary fields without invoking user getters. Byte boundaries use
actual typed-array intrinsics, respect offsets and reject shared/detached views.

The incremental production planner counts base64 expansion, both member rows,
commas and all index/envelope framing. Initial reservation includes each slot's
longest status and four-digit maximum count; it is a conservative reservation,
not an assertion of bytes accepted by a stream. Final planning substitutes the
actual closure metadata and compares that exact length to emitted bytes. The
128MiB archive ceiling includes JSON/base64 overhead; a maximally sized 96MiB
measurement reply plus other evidence is not promised to fit. Transport C's
independent budget is unchanged. Full cross-producer budget and complete evidence
joins remain open, including actual retained J entry bytes and post-FD4 cleanup.

## Fresh ordinary checks

Author commands ran in `/tmp/puni-source-stageb-provider-20261025`, using its frozen
dependencies and an owned mode-0700 `/tmp/puni-stageb-archive-tests` TMPDIR:

```sh
TMPDIR=/tmp/puni-stageb-archive-tests bun test tools/tool-remote-scripts/rehearsals/source-stageb-archive.test.ts
bunx tsc -p tools/tool-remote-scripts/rehearsals/tsconfig.json --noEmit --listFiles
NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CACHE_PROJECT_GRAPH=false bunx nx show projects
bunx eslint tools/tool-remote-scripts/rehearsals/source-stageb-archive.ts tools/tool-remote-scripts/rehearsals/source-stageb-archive.test.ts
bunx prettier --check tools/tool-remote-scripts/rehearsals/source-stageb-archive.ts tools/tool-remote-scripts/rehearsals/source-stageb-archive.test.ts openspec/changes/cross-project-dependencies/verify-source-stageb-archive.md
```

Focused suite: **41 passed, 0 failed, 261 assertions**. Independent test parsing
base64-decodes actual serialized binary/NUL/non-UTF8 bytes, compares every original
byte/hash, fixed slot/member order, all four observer slots, a journal chunk,
multiple chunks, offset views, final LF, index exclusion and both independent
SHA256 calculations. Caller buffer/claim mutation, output mutation, lifecycle,
malformed requests, input equality, original deadline and private errors are covered.
Creation and final-return deadlines are checked, with controlled monotonic clock
observations; synchronous work is not claimed preemptible by a timer.

Planner tests exercise exact/one-over 8MiB member, 8192 total members, 4096 journal
members, 16384 journal member bytes, 4194304 journal aggregate bytes and 134217728
serialized reservation bytes, jointly saturated counters, modulo-three base64
lengths, framing-only exhaustion and invalid numeric inputs. One real 8MiB append
ran. Copied production source with only literal caps reduced exercises actual
append/finalize/serialize paths and pre-copy rejection. Full 128MiB stress and
full-capacity throughput/deadline performance were not executed or claimed.

Compiler/file-list, fresh actual Nx graph, scoped lint and formatting logs are in
the frozen packet. Root owns the two explicit compiler includes and shared links.
Independent source review found no bounded runtime blocker and requested the three
proof-attribution corrections below. Scoped rereview is pending at this corrected freeze.

## Watched causal faults

Initial successful-serializer TDD had an observed assertion RED (missing terminal
LF), followed by GREEN; the initial missing-module run is separately retained and
is not presented as the meaningful RED. Boundary tests also ran against the inert
stub before implementation and failed. Subsequent safety-check proofs use copied
shipping source in memory, with no production cap/configuration/test-success seam.
The exact fault patch is saved before importing the modified copy. Each focused
oracle then runs without the fault and restores GREEN. Shipping-source SHA256 is
checked unchanged before/after each experiment; no shipping source is mutated.

The original freeze claimed 29 consumer assertion failures. Independent review
established **26 valid consumer/planner faults and three setup failures**:
`status-membership`, `reservation-consumer` and `duplicate-close` stopped at the
fail-loud replacement match-count assertion (zero matches), before modified module
import or consumer execution. The generic watcher mistook those assertion failures
for causal consumer proofs. Those original three attempts receive no consumer
credit. Two pre-existing patch files were stale; the duplicate-close patch was
absent. Original packet, source snapshots, report, logs and stale patches were
preserved before correction in the read-only archive
`/tmp/puni-stageb-archive-round1-original/`, whose `preservation-manifest.json`
records every copied hash and the missing duplicate-close patch explicitly.

Formal fix round 1 changes only the three copied-source selector pairs to match
the frozen source's parentheses and trailing comma. Shipping source remains
`7e81e6937bc53f2b92efaee6d03707a4d43d4f6d72a2510d344384b85a86dc42`.
The existing fail-loud one-match assertion remains. Each fresh exact patch was
saved after its verified unique match and before importing the modified module.
**Three new named consumer assertion REDs (exit 1)** then reached the actual
status-membership, early append-reservation and duplicate-close oracles; each
restored control returned **GREEN (exit 0)** with unchanged shipping-source and
test hashes. Reservation credit is early append admission only: the later emitted
length/bound check can still refuse serialization. The other 26 accepted cases
were not rerun. Current coverage is the original 26 valid cases plus these three
fresh causal cases, never retroactive credit for the original setup failures.

Fresh three-case patches/logs/pins are in
`/tmp/puni-stageb-archive-round1/receipts.json`. The corrected packet is
`/tmp/puni-stageb-archive-corrected-frozen-packet.json`; it separately references
the preserved original record, scoped correction diff and full current patch.

| Fault names                                                                              | Actual regression observed                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `closed-fields`, `binding-shape`, `slot-cardinality`                                     | Extra field, malformed nonce or traversal-shaped slot admitted at the production boundary.                                                                                                          |
| `ordinal`, `append-closed-slot`, `duplicate-close`                                       | Skipped ordinal, append after explicit slot closure or second closure admitted.                                                                                                                     |
| `manifest-hash`, `manifest-cardinality`                                                  | Unequal exact input bytes or a second input-manifest member admitted.                                                                                                                               |
| `view-kind`, `shared-view`                                                               | Uint16Array or shared-backed byte view admitted.                                                                                                                                                    |
| `copy-ownership`                                                                         | Caller mutation changed retained bytes and caused later independent hash refusal. This is downstream continued refusal, not unsafe serialized success.                                              |
| `final-completeness`, `status-membership`, `status-enumeration`                          | Missing closures, recorded-without-member or unknown status admitted.                                                                                                                               |
| `poison-failure`, `replay`, `discard`                                                    | Corrected append after failure, repeated serialization or append after discard admitted.                                                                                                            |
| `member-cap`, `count-cap`, `journal-count-cap`, `journal-member-cap`, `journal-byte-cap` | Corresponding reduced literal-cap actual append admitted.                                                                                                                                           |
| `reservation-consumer`                                                                   | Actual append retained a member despite metadata/framing exhausting the reduced archive budget. Later checks are not credited as permitting complete serialized success.                            |
| `emitted-bound`                                                                          | With a controlled emitter dependency adding whitespace beyond a reduced ceiling, omitted emitted-length/bound join returned oversized successful private bytes.                                     |
| `deadline-creation-upper`, `deadline-operation`, `deadline-final`                        | Overlong creation bound, expired append entry or expired final serialization returned success at that consumer. The entry-check omission preserves the same clock observation to isolate the check. |
| `retained-hash`                                                                          | Injected private retained-byte corruption serialized with a stale index digest.                                                                                                                     |
| `safe-integer`                                                                           | A negative retained-byte planner counter was admitted.                                                                                                                                              |

Earlier exploratory faults that still refused are not credited as unsafe acceptance:
a negative member count remained refused by the independent journal-count relation;
a first deadline-entry omission still consumed the expired clock observation in the
final check. Their corrected focused faults use a negative raw-byte counter and an
unchanged entry clock observation respectively. Accepted original receipts and the three fresh round-1 receipts name actual
consumer/planner assertion REDs and restored GREENs. The three original selector
setup failures remain separately classified as described above.

No full gate, native profile, source fixture, genuine preparation/measurement,
provider, namespace, Docker, SSH, host, credentials, age/encryption, subprocess in
the shipped collector/tests, raw-evidence filesystem spool or archive extraction
ran. Local SHA256 is consistency hashing only. Test orchestration used ordinary
Bun command execution; source fault patches and diagnostic logs are not retained
native evidence. This handoff adds no provider acceptance or trust claim.
