# Private Stage B journal source verification

This is the private J source component under the bounded ruling at
`/tmp/puni-source-stageb-journal-source-ruling.md`. It is not a source provider,
authenticated-input verifier, native ownership authority, cleanup proof or measured
application result. One-parent exclusive publication does not prevent replay under
a different parent. No production hook was added.

## Commands and ordinary evidence

All commands ran in `/tmp/puni-source-stageb-provider-20261025` using its own
installed dependencies. Before tests, `/tmp/puni-stageb-journal-tests` was created
with mode 0700 and selected as `TMPDIR`. The actual effective test UID is 1000.

- `TMPDIR=/tmp/puni-stageb-journal-tests bun test tools/tool-remote-scripts/rehearsals/source-stageb-journal.test.ts`:
  57 pass, 0 fail, 210 Bun assertions in the final focused run; asynchronous rejection assertions additionally use `node:assert/strict`.
- `bun x tsc --project tools/tool-remote-scripts/rehearsals/tsconfig.json --noEmit`:
  passed after root explicitly included both J files. This is rehearsal compilation,
  not ordinary production discovery or a full repository typecheck.
- `bun x eslint tools/tool-remote-scripts/rehearsals/source-stageb-journal.ts tools/tool-remote-scripts/rehearsals/source-stageb-journal.test.ts`:
  passed as an author advisory scoped lint check. Root still owns fresh graph-backed lint evidence.
- `bun x prettier --check tools/tool-remote-scripts/rehearsals/source-stageb-journal.ts tools/tool-remote-scripts/rehearsals/source-stageb-journal.test.ts`:
  passed. This verification document is formatted separately before handoff.

Exact outputs, TDD logs, omission patches, per-omission original/restored hashes,
and watched restored GREEN logs are in `/tmp/puni-stageb-journal-evidence/`.
The original reviewed packet remains `/tmp/puni-stageb-journal-frozen-packet.json`.
The corrected round-1 packet is `/tmp/puni-stageb-journal-corrected-frozen-packet.json`.
Round-1 outputs and new omission receipts live in `/tmp/puni-stageb-journal-evidence/round1/`;
original artifacts are retained separately and are not overwritten by round-1 checks.
Root owns final source-list checking, fresh graph-backed lint and independent review.
Those root checks and independent rereview are not claimed by the author here.
Round-1 compiler, focused suite, scoped advisory lint and format logs are the current author checks.

## Watched TDD findings

The initial closed-claim test failed because the temporary implementation resolved
instead of rejecting a sentinel-bearing extra field. The implemented boundary then
passed and closed both transferred descriptors. Lifecycle tests subsequently failed
at the explicit unimplemented intention operation, then passed with actual durable
claim/intent/dispatch/outcome/seal IO.

Initial filesystem-failure TDD exposed unclosed transferred descriptors, and
cleanup-only TDD exposed dispatch of a previously retained creation intention.
The first checkpoint also added eventual late-leaf disposal, but independent review
correctly rejected its early returned settlement: its old tests released the IO gate
only after failure had returned. Those two tests are replaced by independent-release
joined-lifetime regressions below. The original frozen source/report and their
historical logs remain available; they are not accepted as R1 settlement proof.

The first five-case lifetime run had three meaningful RED cases and two existing
GREEN controls; those controls were not credited as initial regressions. The
strengthened final eight-case suite was then run against the exact reviewed source:
six cases failed and two controls passed, followed by eight restored GREEN cases.
`round1/reviewed-baseline-current-tests/` retains that exact snapshot patch, hashes
and outputs. Additional finite tests check first
failure versus late IO and both transferred-close failures, a leaf-close-only failure
without an invented nested primary, and caller close during final readback return.
The latter has a causal omission that enables the inert effect after close unless
the outermost fulfillment check is present. Tooling diagnostics remain tooling
failures, never causal proof.

## Independent consumer omissions

Each final row has `omission.patch`, `before.sha256`, `red.log`,
`restored.sha256`, and `green.log` under the named evidence directory. Every final
RED exited 1 at the stated assertion; every restored focused GREEN exited 0.
`omissions-final.json` enumerates all 13 receipts.

| Evidence directory suffix (`final-…`) | Injected fault and observed regression                                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `original-token`                      | Fallback from original WeakMap lookup admitted a spread intention and returned dispatch; expected rejection failed.                                                                                                                           |
| `named-directory`                     | Removed named-child/held-directory comparison; actual replaced nonce child still allowed dispatch.                                                                                                                                            |
| `retained-inode`                      | Removed retained inode comparison; actual same-byte 0600 replacement still allowed dispatch.                                                                                                                                                  |
| `exact-bytes`                         | Removed exact byte comparison; scoped owned read dependency corrupted same-length bytes without changing stat identity, yet dispatch returned. This is a controlled read dependency fault, not an on-disk corruption claim.                   |
| `file-sync`                           | Removed file sync invocation; dispatch enabled the fixed inert effect without entering the gated file-sync witness. This proves invocation/order, not power-loss durability.                                                                  |
| `directory-sync`                      | Removed directory sync invocation; dispatch enabled the inert effect without entering its gated name-durability witness.                                                                                                                      |
| `exclusive-create`                    | Removed O_EXCL; two real constructors synchronized at the empty-roster boundary both returned original journals. Restored source admitted exactly one.                                                                                        |
| `dispatch-one-shot`                   | Removed unused-intention check; repeated original intention returned a second dispatch.                                                                                                                                                       |
| `observed-only`                       | Injected reference insertion after uncertain creation; snapshot membership contained the invalid reference instead of remaining empty. No native cleanup was attempted.                                                                       |
| `class-join`                          | Removed identity class join; foreign-class observation returned a recorded reference.                                                                                                                                                         |
| `identity-uniqueness`                 | Removed live stable-identity uniqueness check; duplicate observation returned another reference.                                                                                                                                              |
| `byte-bound`                          | Removed the unified count/byte reservation guard; a bounded serializer dependency fault exceeded 16KiB and still published/returned dispatch. This directly proves the per-record byte consumer, not exhaustion of every independent ceiling. |
| `close-settlement`                    | Replaced descriptor settlement with an already resolved promise; the original owned parent remained open. The test closed only its own leaked descriptors in final cleanup.                                                                   |

An earlier exclusive-create omission with an uncontrolled race still encountered a
downstream roster refusal and did not demonstrate unsafe acceptance. The later
barrier-synchronized race produced the causal two-token RED above. This distinction
is retained in the author report; an exit code alone is not the proof.

Adjacent source `Proof:` comments refer only to these observed regressions. Final
formatting changes source hashes, while each omission receipt retains its exact
pre-omission/restored hash; the frozen packet separately identifies final bytes.

## Finite fixed-ceiling accounting refinement

Root adopted `/tmp/puni-stageb-journal-bounds-ruling.md`. The two exported pure
accounting helpers are called unconditionally by their actual publication/create
consumers and accept no ceiling options or authority inputs. Shipping limits remain
4096 records, 16384 bytes per record, 4194304 cumulative bytes and 256 lifetime
references. Publication consumes the returned charge before allocating its Buffer
or opening the next file. No duplicate arithmetic branch remains in the consumer.

Exact production-helper tests exercise last-record admission and next-record
refusal, 16384 versus 16385 bytes, exact cumulative 4194304 versus one-byte overflow,
retained nonzero charges, 255+0 and 224+31 creation reservations versus 256+0 and
225+31 refusal, and negative/fractional/nonfinite/unsafe/already-out-of-range inputs.
The initial explicit planner stubs failed the positive arithmetic assertions, then
the actual planners passed. Malformed-input tests passing those stubs were not
classified as meaningful initial RED.

Private source copies under the test-owned temporary root reduce exactly one fixed
constant for each consumer witness. All filesystem IO, exclusive creation, full
history readbacks, sync, deadlines, original tokens and schemas remain intact. At
record cap 8, the ninth immutable entry is refused. At cumulative cap 4096, the
last admitted actual directory byte total is retained and the next crossing record
creates no leaf. At resource cap 2, both absence-recorded lifetime references and
one recorded reference plus one pending creation block the next intention.

The following independent omissions each have their own patch, original/restored
hash, causal RED and watched restored GREEN in the named evidence directory:

| Directory               | Observed regression                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `planner-record-count`  | Removed actual planner count guard; exact negative returned count 4097.                                                                                            |
| `planner-cumulative`    | Removed actual cumulative guard; one-byte overflow returned 4194305.                                                                                               |
| `planner-resource`      | Removed actual total guard; 257th reservation returned.                                                                                                            |
| `planner-record-bytes`  | Removed actual planner next-record byte maximum; the bounded serializer fault published and returned dispatch. This refreshes the pre-extraction byte-bound proof. |
| `consumer-record-count` | Removed actual publication planner call; reduced-cap ninth record settled instead of rejecting.                                                                    |
| `consumer-cumulative`   | Removed actual publication planner call; reduced-cap source continued appending instead of refusing.                                                               |
| `consumer-resource`     | Removed actual creation planner call; a third intention returned despite two lifetime references.                                                                  |
| `consumer-pending`      | Dropped pending-count operand at the actual consumer; a third intention returned with one recorded and one pending creation.                                       |

`omissions-bounds.json` and `omissions-record-bytes.json` enumerate these eight
receipts. Full shipping-ceiling filesystem exhaustion and performance under that
load are unexecuted and are not required by the adopted bounded refinement. These
proofs establish exact fixed arithmetic plus reduced-threshold real consumer wiring,
not full-capacity throughput or deadline performance.

## Review correction R1: one joined owned-IO lifetime

The adopted clarification is: the original monotonic deadline invalidates admission
and successful fulfillment immediately. It does not cancel a kernel operation.
Returned operation/constructor failure and the memoized close join already-started
noncancellable IO and every acquired leaf. A still-held IO or close gate therefore
leaves settlement pending/unproved beyond that deadline. No deadline is renewed.

Each serialized operation registers its completion before starting work. A private
IO invocation thunk checks liveness before calling the filesystem, awaits the actual
operation, and checks again after it settles. The active operation's timer remains
armed through leaf disposal. Constructor validation/publication uses that same
lifetime object. Explicit close invalidates admission synchronously and joins the
active completion, then settles any late-acquired leaves and both transferred
handles. Failure completion resolves its own active gate before awaiting memoized
close, avoiding a self-await deadlock. A WeakSet prevents any owned FileHandle close
from being attempted twice; failed closes are retained and are not blindly retried.

The first primary is retained separately from every later IO/leaf/parent/directory
close failure. A close-only failure has an absent operation primary rather than an
invented nested aggregate. Memoized close preserves its rejection. The planner byte
Proof comment now sits next to its nextBytes check; this relocation is cosmetic and
adds no proof claim.

Eight finite joined-lifetime tests use independent gate controllers and actual owned
filesystem objects. They cover late open, failed late leaf close, explicit close with
failed pending sync, constructor late open/cleanup failure, no next IO after close,
first timeout plus late IO and both transferred-close failures, close-only diagnostics,
and close during the final readback continuation. Gates release before awaiting
returned settlement. There is no polling-for-eventual-disposal oracle. A short
scheduling window observes that close remains pending while the independently held
gate is closed; descriptor/handle settlement is asserted directly after release.

## Review correction R2: finite boundary closure

Actual same-object/same-FD and separately opened same-inode aliases now have explicit
refusal/settlement tests. Only transferred descriptors close; the unused owned child
fixture remains open. Changed UID/GID fields are controlled faults in real owned
FileHandle stat observations, with no chown or privilege change. Missing identity
functions and unsupported platform are private source-copy dependency faults; they
assert the explicit precondition error and no claim, not an incidental exception.
The real platform/process credentials remain unchanged. A scoped writer writes an
actual one-byte-short final record, which is retained after metadata refusal and
constructor settlement. Positive file/helper/descriptor observations remain detached
private control evidence; their synthetic native identities are never operated on.

The following round-1 omissions all have exact patches, before/restored SHA256,
assertion output and watched restored GREEN. Every final RED exited 1 and every
restored focused run exited 0. These classify what was actually observed:

| Receipt under `round1/`      | Observed regression                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending-work-join`          | Close settled while the separately gated actual acquisition remained pending/live.                                                                                                                |
| `late-leaf-cleanup`          | Failure/close returned after release with the owned late leaf still open.                                                                                                                         |
| `primary-cleanup-join`       | Returned private failure omitted the exact failed late leaf close.                                                                                                                                |
| `first-primary`              | Late IO/aggregate replaced the original timeout primary.                                                                                                                                          |
| `exact-once-close`           | The same transferred FileHandle close was invoked twice during alias refusal.                                                                                                                     |
| `final-fulfillment`          | Dispatch returned and enabled the fixed inert effect after caller close during final readback return.                                                                                             |
| `deadline-primary`           | Removing active deadline invalidation lost the original timeout classification when caller close intervened. Settlement still joined; this is a primary-retention regression, not native success. |
| `close-only-primary`         | A close-only failure acquired an invented nested operation primary.                                                                                                                               |
| `refreshed-idle-close`       | Refreshed original idle close proof: returned close left the owned parent open.                                                                                                                   |
| `foreign-uid`                | Foreign observed UID was admitted and a claim/journal returned.                                                                                                                                   |
| `foreign-gid`                | Foreign observed GID was admitted and a claim/journal returned.                                                                                                                                   |
| `unsupported-platform`       | Controlled unsupported platform binding was admitted and a claim/journal returned.                                                                                                                |
| `missing-uid`, `missing-gid` | Explicit precondition refusal was lost; a downstream TypeError still refused. These are modeled-refusal classification proofs, not unsafe acceptance.                                             |
| `same-descriptor`            | Descriptor-alias refusal was lost; downstream directory-alias refusal remained.                                                                                                                   |
| `same-inode`                 | Directory-alias refusal was lost; downstream identity-join refusal remained.                                                                                                                      |
| `short-write-size`           | Writer-size refusal was lost; independent exact-byte readback still refused the actual short record. No token escaped.                                                                            |

The 17 rows/variants are enumerated in `round1/omissions.json`,
`omissions-exact-once.json`, `omissions-final-fulfillment.json` and
`omissions-extra.json`. The five remaining-downstream-refusal variants are explicitly
not credited as unsafe-success proofs. The three required independent R1 consumer
omissions are causal pending-settlement/live-leaf/lost-cleanup regressions.

## Absence, unreadability, bounds and remaining checks

| Boundary                                   | Executed observation or exact limit                                                                                                                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing retained entry                     | Unlinked claim; fresh inspection and later seal refused.                                                                                                                                                                                                  |
| Unreadable retained entry                  | Removed owner read access with chmod 000 on the actual UID-1000-owned fixture; direct read returned EACCES. Journal inspection separately refused the exact mode change. Mode restored only on the owned fixture in finally.                              |
| Read dependency failure                    | Scoped owned FileHandle read injected EACCES; dispatch refused, primary error was retained, both owned descriptors closed. This is separate from native non-root DAC unreadability.                                                                       |
| Outstanding ceiling                        | Exactly 32 intentions persisted; the bounded 33rd refused before publication.                                                                                                                                                                             |
| Per-record ceiling                         | Bounded serializer dependency fault above 16KiB refused before publication; omission admitted it.                                                                                                                                                         |
| 256 resource ceiling                       | Exact production-planner boundary and reduced-cap real consumer/omission verified; full-ceiling filesystem exhaustion unexecuted, not required by the adopted refinement.                                                                                 |
| 4096 record/sequence ceiling               | Exact production-planner boundary and reduced-cap real consumer/omission verified; full 4096-file stress is unexecuted, not required by the adopted refinement.                                                                                           |
| 4MiB cumulative ceiling                    | Exact production-planner boundary and reduced-cap real consumer/omission verified; full-ceiling filesystem exhaustion unexecuted, not required by the adopted refinement.                                                                                 |
| Safe-integer charge overflow               | Unsafe and invalid planner inputs directly rejected. Fixed record/byte maxima guarantee subsequent record sums remain safe integers; creation sum checks unsafe addition independently.                                                                   |
| Owner GID/UID and platform refusal         | Actual owner/modes positive; controlled foreign UID/GID stat, missing identity-function and unsupported-platform source faults refuse explicitly. No real chown, privilege switch or actual OS switch. Exhaustive malformed identities remain unexecuted. |
| Partial write                              | Actual one-byte-short writer dependency left the final record and refused before token; separate directory-sync failure also retained publication evidence. Neither path repairs or truncates the retained file.                                          |
| Constructor alias and every identity class | Actual same-handle/FD and separately opened same-inode aliases verified; representative network/file/helper/descriptor positive identities verified. Exhaustive identity-class matrix remains unexecuted.                                                 |
| Static source inclusion/lint/review        | Root adds the explicit two-file inclusion. Root's final file-list check, fresh graph lint and independent review are pending at author freeze.                                                                                                            |

The corrected packet is a scoped R1/R2 rereview handoff, not a declaration that J
or Stage B is complete. No full gate, SSH, provider, real source fixture, genuine
preparation, measurement, native inspector, namespaces, Docker, systemd, network,
credentials, archive encryption, signing or custody operation was executed. Only
ordinary local SHA256 record consistency hashing was used.
