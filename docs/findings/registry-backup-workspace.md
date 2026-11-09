# Registry backup source and workspace bounds

Research on 2026-11-01 for [Task 4.3](../../openspec/changes/bound-registry-storage/tasks.md).
This extends [backup accounting](registry-backup-accounting.md). The user's
2026-11-04 clarification defines the 100 GiB budget by stored file/object sizes;
provider billing overhead is excluded and its contract is no longer a blocker.
**Admission under the 100 GiB budget is not yet proved.** This note records source inspection and conditional arithmetic,
not executed restic/resource/provider proofs. Proposed interfaces below are not
implemented. The [backup spec](../../openspec/changes/bound-registry-storage/specs/registry-storage-lifecycle/spec.md#requirement-bounded-backup-lifecycle)
still requires worst-case reservation and preserved recovery coverage.

## Current integration and fixed defaults

The pinned [tool manifest](../../tools/tool-fleet/src/backup-registry.lock.json)
selects restic **0.19.1** and a binary SHA-256. The current
[store](../../tools/tool-fleet/src/registry-backup-store.ts) passes only its validated
environment plus a fixed PATH and always adds `--no-cache`. Admission now separates
repository inspection from snapshot requests carrying bounded raw source
observations; the misleading `maximumNewBytes` capacity sum is removed. Required
per-root sourceLimits bound traversal and logical/metadata observations, not encoded
or physical bytes. The
[root action](../../tools/tool-fleet/src/registry-maintenance-backup.ts) admits before
normal-lock retention inspection and calls admission again during preparation;
the [production adapter](../../tools/tool-fleet/src/registry-backup-admission.ts)
still refuses `backup-budget-unavailable`. The
[retention API](../../tools/tool-fleet/src/registry-backup-retention.ts) returns exact
eligible IDs and snapshot-version evidence, without effect authorization.

Absent flags do not by themselves mean unknown behavior. With the existing
allowlisted child environment, these source defaults are determined:

| Dimension              | Pinned behavior                                                                                                | Primary source                                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pack target            | 16 MiB; supported targets 4–128 MiB                                                                            | [repository constants/options](https://github.com/restic/restic/blob/v0.19.1/internal/repository/repository.go#L25-L27)                                                                                                        |
| Compression            | `auto`; format v2 compresses trees and normally file blobs; `off` still compresses trees and unpacked metadata | [compression paths](https://github.com/restic/restic/blob/v0.19.1/internal/repository/repository.go#L354-L367)                                                                                                                 |
| File readers           | 2                                                                                                              | [archiver defaults](https://github.com/restic/restic/blob/v0.19.1/internal/archiver/archiver.go#L128-L155)                                                                                                                     |
| Tree savers            | `GOMAXPROCS + readConcurrency`                                                                                 | [same defaults](https://github.com/restic/restic/blob/v0.19.1/internal/archiver/archiver.go#L148-L155)                                                                                                                         |
| Packers                | Two slots for each of tree and file content                                                                    | [packer count](https://github.com/restic/restic/blob/v0.19.1/internal/repository/packer_manager.go#L40-L49), [manager construction](https://github.com/restic/restic/blob/v0.19.1/internal/repository/repository.go#L559-L568) |
| Backend connections    | 5                                                                                                              | [S3 configuration](https://github.com/restic/restic/blob/v0.19.1/internal/backend/s3/config.go#L26-L45)                                                                                                                        |
| Lock acquisition retry | Default `--retry-lock=0`; acquisition can make a final attempt after contention                                | [global flags](https://github.com/restic/restic/blob/v0.19.1/internal/global/global.go#L92-L108), [acquisition loop](https://github.com/restic/restic/blob/v0.19.1/internal/repository/lock.go#L41-L75)                        |

Inference: fingerprint these resolved defaults with the binary/configuration;
new configuration fields are only needed where the deployment chooses a different
profile or needs an enforced ceiling. Repository format must be observed: the
current config inspection validates the ID, not a format-specific bound. Actual
runtime CPU parallelism, temporary mount capacity and metadata limits are not
determined by those defaults.

## Missing source dimensions

Restic resets its chunker for each file and appends each chunk ID to that file's
node. Chunker 0.4.0 defaults to a 512 KiB minimum and an 8 MiB maximum; EOF permits
the final shorter chunk. The version is pinned by restic's dependency manifest.
[File saver](https://github.com/restic/restic/blob/v0.19.1/internal/archiver/file_saver.go#L154-L190),
[chunker](https://github.com/restic/chunker/blob/v0.4.0/chunker.go#L8-L20),
[dependency pin](https://github.com/restic/restic/blob/v0.19.1/go.mod#L23-L31).

Conditional arithmetic: for stable regular-file paths with logical lengths
`s_i > 0`, total logical bytes `B`, and nonempty path count `F`, chunk references
are bounded by
`K <= sum(ceil(s_i / 524288)) <= floor(B / 524288) + F`.
An empty regular file contributes metadata but no content chunk. Count paths,
including hardlink names, rather than crediting presumed hardlink/dedup savings.
Use logical lengths: an allocated-byte limit alone cannot establish `B` for sparse
files. This is a mathematical implication of the per-file chunking, not a new
property already enforced by the current admission request.

The serialized node contains names, ownership names, timestamps, link targets,
xattrs, optional platform attributes and chunk references. Names are first
`strconv.Quote`-escaped and then JSON-escaped. Linux xattr capture reads names and
values; some attribute-read errors warn and skip. Byte limits on file bodies
therefore do not establish a complete recoverable metadata envelope.
[Node fields/marshalling](https://github.com/restic/restic/blob/v0.19.1/internal/data/node.go#L76-L105),
[name encoding](https://github.com/restic/restic/blob/v0.19.1/internal/data/node.go#L159-L177),
[xattr capture](https://github.com/restic/restic/blob/v0.19.1/internal/fs/node_xattr.go#L91-L113).

A tree is built as one JSON buffer and saved as one blob, not file-chunked.
The exact tree framing is 10 bytes before nodes and 3 after them, with commas
between nodes. [Tree builder](https://github.com/restic/restic/blob/v0.19.1/internal/data/tree.go#L193-L268),
[tree saver](https://github.com/restic/restic/blob/v0.19.1/internal/archiver/tree_saver.go#L71-L151).

Proposed observation under the existing stopped-source authority:

- Bound logical bytes separately for both mounted roots, file and directory path
  counts, total directory entries, maximum entries per directory and path depth.
  Include the synthetic root/ancestor nodes introduced by absolute backup paths.
  An inode ceiling alone does not count all hardlink directory entries.
- Bound raw name/path bytes, symlink-target bytes, xattr count/name/value bytes,
  user/group strings and any accepted platform attributes. Either reject unsupported
  node kinds/attributes or include their actual serialization; never silently omit
  content to fit the budget. Require unreadable metadata to fail admission.
- Compute a field-by-field upper serialized node length `U(v)`, including worst
  content-array references (66 bytes per quoted full ID plus separators), double
  name escaping, base64 attribute values and fixed/numeric JSON fields. A
  restic-compatible encoder or reviewed exact counting routine is needed; ordinary
  `JSON.stringify(name)` alone is insufficient.
- For directory `j` with `n_j` nodes, reserve
  `T_j = 13 + sum(U(v)) + max(n_j - 1, 0)`; record total tree bytes and maximum
  `T_j` separately. Stop traversal as soon as any count, byte or time ceiling is
  exceeded. Bind the observation hash to source mounts, journal revision and
  writer exclusion through the effect.

The contents-only observer now supplies bounded raw facts, UID/GID sets and
source hashes under the declared writer-exclusion precondition. The complete
serializer/ancestor/resolver profile above remains prospective. Linux attribute
enumeration can omit inaccessible names, so caller-visible observations cannot
establish full namespace coverage without separate reader evidence.
[listxattr contract](https://man7.org/linux/man-pages/man2/listxattr.2.html),
[attribute namespace permissions](https://man7.org/linux/man-pages/man7/xattr.7.html).
No source filesystem scan was executed by this research; implementation/native
consumer evidence is recorded separately in the change verification artifact.

## Plaintext metadata encoding prerequisites (2026-11-01)

A fresh read of the public `/tmp/puni-restic-0.19.1` matched manifest SHA-256
`20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`.
`version --json` reported `0.19.1`, `go1.26.4`, `linux/amd64`. Its inline Go build
record reports `CGO_ENABLED=0`, tags `selfupdate,disable_grpc_modules` and
`GOAMD64=v1`; no `GOEXPERIMENT` override is recorded. `go version -m` was unavailable
because `go` is absent; a read-only Python extraction followed Go's
[inline build-record format](https://github.com/golang/go/blob/go1.26.4/src/debug/buildinfo/buildinfo.go#L178-L255).
This identifies the public copy, not root-only installation/enforcement.

**Owner strings remain an independent profile input.** These build settings select
Go's [pure-Go Unix account parser](https://github.com/golang/go/blob/go1.26.4/src/os/user/lookup_unix.go#L5-L85),
without requiring the `osusergo` tag. It reads account files, not NSS through cgo.
[UID lookup](https://github.com/golang/go/blob/go1.26.4/src/os/user/lookup.go#L42-L49)
first tries cached `Current()`; the
[current-user fallback](https://github.com/golang/go/blob/go1.26.4/src/os/user/lookup_stubs.go#L21-L62)
can use `USER`/`HOME`, absent from the store's child environment. The parser
[opens fixed account paths](https://github.com/golang/go/blob/go1.26.4/src/os/user/lookup_unix.go#L189-L222),
returns the first matching name and grows a line buffer until sufficient columns
arrive. It imposes **no username/group-name byte cap**. Restic caches lookup strings
per UID/GID and uses empty strings on lookup errors;
[numeric IDs do not determine those strings](https://github.com/restic/restic/blob/v0.19.1/internal/fs/node.go#L63-L179).
Thus binary plus environment fixes the lookup implementation, not its strings.
A complete bound needs separately bounded immutable resolver input, including
current-user behavior, held through the child lifetime. It may supply exact
UID/GID mappings or conservative raw-name ceilings for every possible lookup;
observing only maximum UID/GID is insufficient. No host account files were read.

The following is a **conditional field-by-field counting recipe**, not an
implemented serializer or physical reservation. Let `J(s)` be the byte length of
Go 1.26.4's default JSON string encoding, including quotes; `Q(s)` is
`strconv.Quote(s)` with its outer quotes removed. With raw byte length `b`,
`J(s) <= 2 + 6b` and `J(Q(s)) <= 2 + 6b`. This is local encoding arithmetic:
JSON's HTML/control/invalid-byte escape costs at most six bytes per input byte;
for the composed name encoding, an invalid byte becomes five bytes (`\\xNN`),
quote/backslash at most four, HTML punctuation six, and nonprinting Unicode
escapes at most seven bytes per two-byte rune or eleven per four-byte rune.
[Go quoting](https://github.com/golang/go/blob/go1.26.4/src/strconv/quote.go#L28-L109),
[JSON escaping](https://github.com/golang/go/blob/go1.26.4/src/encoding/json/encode.go#L946-L1012).
This six is an escape expansion proof, not a metadata multiplier.

For non-null byte slices define `B(v) = 2 + 4 * ceil(v / 3)`; if nil is possible,
use `max(4, B(v))`. Go uses padded base64, without further string escaping.
For xattr count `x`, raw names `a_i` and values of lengths `v_i`, the attribute
array is bounded by
`A = 2 + sum(18 + J(a_i) + max(4, B(v_i))) + max(x - 1, 0)`.
The 18 is two object braces, a comma and the `name`/`value` keys with colons.
Totals alone permit the looser value contribution
`4x + 4 * floor((sum(v_i) + 2x) / 3)`; exact padding needs per-value lengths.
[JSON byte slices/arrays](https://github.com/golang/go/blob/go1.26.4/src/encoding/json/encode.go#L781-L847).

For each generated node, choose the following value bounds, retaining optional
fields conservatively if their absence is not established. With `f` retained
fields, `U = 2 + sum(length(key) + 3 + valueBound) + max(f - 1, 0)`.
The extra three counts each key's quotes and colon; two counts object braces.

| Keys                                  | Value byte bound                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `name`                                | `J(Q(rawName))`                                                                                               |
| `type`                                | Exact quoted type; at most 9 for admitted file/directory/symlink                                              |
| `mode`, `uid`, `gid`                  | At most 10 decimal digits each (`uint32`)                                                                     |
| `mtime`, `atime`, `ctime`             | At most 37 each, including quotes, for successful time serialization                                          |
| `user`, `group`                       | `J(profileResolvedName)` or `2 + 6 * profileRawNameCeiling` each                                              |
| `inode`, `device_id`, `size`, `links` | At most 20 decimal digits each (`uint64`); actual observed digits may tighten this                            |
| `linktarget`                          | `J(rawTarget)`, even when the target is invalid UTF-8                                                         |
| `linktarget_raw`                      | Additionally `B(rawTargetLength)` when invalid UTF-8; budget it for every symlink if validity is not recorded |
| `extended_attributes`                 | `A` above                                                                                                     |
| `content`                             | `max(4, 2 + 66k + max(k - 1, 0))` for at most `k` references                                                  |
| `subtree`                             | 66 for a directory ID                                                                                         |

The [node encoder](https://github.com/restic/restic/blob/v0.19.1/internal/data/node.go#L159-L177)
keeps **both** symlink fields for invalid UTF-8; it does not replace `linktarget`
with the raw field. `Path` is excluded. Fresh Linux nodes have no generic
attributes because [collection is a no-op](https://github.com/restic/restic/blob/v0.19.1/internal/fs/node_unix.go#L27-L30).
For the admitted three node kinds, device-node `device` is absent; this recipe
assumes generated nodes with empty `error`. Broader/imported nodes need separate
bounds. [Time encoding](https://github.com/golang/go/blob/go1.26.4/src/time/format_rfc3339.go#L15-L74)
limits successful output to four year digits, nine fractional digits and a six-byte
zone; [IDs](https://github.com/restic/restic/blob/v0.19.1/internal/restic/id.go#L77-L85)
are 64 hex digits plus quotes. Without `--with-atime`, restic
[sets access time to modification time](https://github.com/restic/restic/blob/v0.19.1/internal/archiver/archiver.go#L231-L259).
Metadata read failures must still refuse admission: restic itself can
[warn and skip xattrs](https://github.com/restic/restic/blob/v0.19.1/internal/fs/node_xattr.go#L91-L113).

**Chunk caveat:** the earlier `ceil(size / 512 KiB)` bound applies to fresh
chunking. The current command permits an unchanged file to
[reuse the parent's content-reference list](https://github.com/restic/restic/blob/v0.19.1/internal/archiver/archiver.go#L486-L505).
Bound and authenticate those historical lists too, or separately prove/enforce a
profile that rereads them. Current source size alone cannot validate an arbitrary
historical reference list.

For the two independent canonical absolute roots with component depths `d1,d2`
and common proper-prefix depth `c`, let `P` be the union of non-root proper
ancestor paths. Then `a = |P| = d1 + d2 - 2 - c`. If contents counts include each
selected root, generated node count is `paths1 + paths2 + a`, and tree count is
`directories1 + directories2 + a + 1` (the final one is the snapshot root tree).
[Path construction](https://github.com/restic/restic/blob/v0.19.1/internal/archiver/tree.go#L94-L190)
merges shared ancestors. Their nodes use **real ancestor metadata**, including
ownership/xattrs, through
[dirPathToNode](https://github.com/restic/restic/blob/v0.19.1/internal/archiver/archiver.go#L619-L729);
the fake `/` node itself is not serialized into its own tree. Require separately
bounded, stable observations of `P`, not guessed zero metadata. For each tree use
the earlier `13 + sum(U) + max(children - 1, 0)` formula. Per-tree observations give
a useful maximum; allocating all bounded node bytes to any one tree is a valid
but looser maximum. The existing contents observer's raw facts/hash stay separate
from this prospective encoding layer.

Remaining interface requirements: immutable resolver-profile evidence; held
ancestor metadata; historical reference maxima or a proved reread profile; checked
integer counting; total/maximum tree bounds; and production-path negatives for
these consumers. No encoder fixture or source scan was executed here. Root-only
binary/profile enforcement, complete source envelope, encrypted/physical
admission, effects, prune and restore proofs remain unverified; the 100 GiB claim
and goal status are unchanged.

## Conditional encrypted payload and object bounds

Pinned encryption adds a 16-byte nonce and a 16-byte authentication tag.
[Crypto constants](https://github.com/restic/restic/blob/v0.19.1/internal/crypto/crypto.go#L14-L24).
Pack headers add 37 bytes per uncompressed entry or 41 per compressed entry,
plus 32 encrypted-header bytes and a 4-byte header-length suffix. Thus for `N`
blobs in `P` nonempty packs, header bytes are at most `41N + 36P`.
[Pack encoding](https://github.com/restic/restic/blob/v0.19.1/internal/repository/pack/pack.go#L66-L102),
[header entries](https://github.com/restic/restic/blob/v0.19.1/internal/repository/pack/pack.go#L147-L170).

Restic pins klauspost/compress 1.18.6. Its encoder's `MaxEncodedSize` sums source
bytes, frame overhead and 3 bytes per block. With restic's no-dictionary,
no-CRC/no-padding options, use the conservative expression
`Z(s) = s + 14 + 3 * (floor(s / 131072) + 1)`.
The default block size is 128 KiB. Raw fallback prevents expanding compressed
blocks beyond raw payload plus framing. This is a source-derived bound for this
encoder profile; it is not a total process-memory bound.
[Encoder calculation](https://github.com/klauspost/compress/blob/v1.18.6/zstd/encoder.go#L607-L637),
[encoder defaults](https://github.com/klauspost/compress/blob/v1.18.6/zstd/encoder_options.go#L32-L43),
[block constant](https://github.com/klauspost/compress/blob/v1.18.6/zstd/blockdec.go#L36-L43),
[raw fallback](https://github.com/klauspost/compress/blob/v1.18.6/zstd/blockenc.go#L772-L778).
The literal-only path also falls back when compression cannot save space.
[Literal encoding](https://github.com/klauspost/compress/blob/v1.18.6/zstd/blockenc.go#L317-L407).

Conditional arithmetic for one successful backup, with no dedup credit and `G`
trees: `N <= K + G`, `P <= N`, and new pack payload is bounded by

```text
sum(Z(chunkLength) + 32) + sum(Z(T_j) + 32) + 41N + 36P
```

For chunks, avoid reading bodies merely to discover boundaries by bounding
`sum(Z(chunkLength)) <= B + 17K + 3 * floor(B / 131072)`.
Use checked integer arithmetic throughout. This includes blob encryption and pack
headers; it excludes indexes, snapshots, locks, retries and provider charges.

Pack target is not maximum object length. Blobs are appended before testing pack
size; oversized blobs get their own pack. The header also has a separate maximum
of `16 MiB + 4`.
[Packing](https://github.com/restic/restic/blob/v0.19.1/internal/repository/packer_manager.go#L109-L176),
[header limit](https://github.com/restic/restic/blob/v0.19.1/internal/repository/pack/pack.go#L211-L240).
Conditional bound: if `Q` bounds any encrypted blob and `p` is pack target, then
`p + Q + (16 MiB + 4)` conservatively bounds one generated pack. Reject source
shapes that violate the selected object or plaintext-blob ceiling; raising `p`
does not split a huge directory tree.

Indexes encode pack ID, then each blob ID/type/offset/length and optional
uncompressed length. Stored lengths/offsets are uint32. A maximal such blob JSON
record is 160 bytes; an empty pack record is 84 and index framing/newline is 13.
Including commas, `13I + 85P + 161N` bounds total plaintext across `I` fresh indexes
when each pack occurs once. Add `Z(indexBytes) + 33` per index for format v2.
[Index schema/encoding](https://github.com/restic/restic/blob/v0.19.1/internal/repository/index/index.go#L280-L355),
[uint32 boundary](https://github.com/restic/restic/blob/v0.19.1/internal/repository/index/index.go#L71-L78).
The extra unpacked-format byte precedes encrypted compressed JSON.
[Unpacked encoding](https://github.com/restic/restic/blob/v0.19.1/internal/repository/repository.go#L418-L485).

Do not assume `I = ceil(N / 50000)`: fullness also uses age, and the threshold is
checked after a whole pack. For fresh successful backup indexes, the coarser
`I <= P` follows because each nonempty index receives a newly stored pack and is
finalized once. Imported/old indexes and interrupted operations need their own
observed bounds.
[Fullness](https://github.com/restic/restic/blob/v0.19.1/internal/repository/index/index.go#L89-L127),
[store/finalize](https://github.com/restic/restic/blob/v0.19.1/internal/repository/index/master_index.go#L137-L199).

A snapshot's metadata also includes paths, host/user, tags, program version,
summary and optional parent. Bound/serialize this fixed command's fields and add
its unpacked-object cost; file processed-byte counters cannot replace it.
[Snapshot schema](https://github.com/restic/restic/blob/v0.19.1/internal/data/snapshot.go#L14-L47).
All formulas above are prospective payload bounds conditional on complete
serialization/source evidence; none establishes billable storage.

## Upload attempts and lock objects

The S3 backend supplies known object length, `SendContentMd5=true` and a 200 MiB
part size. MinIO uses a single PUT at or below that size; larger objects enter
multipart. Do not use its general 16 MiB documentation comment as this profile's
threshold. [Restic S3 Save](https://github.com/restic/restic/blob/v0.19.1/internal/backend/s3/s3.go#L267-L287),
[MinIO dispatch](https://github.com/minio/minio-go/blob/v7.1.0/api-put-object.go#L330-L353).

For these options the multipart dispatch reaches the buffered sequential
checksum path, which allocates one part buffer and attempts abort on failure;
five repository connections still permit several objects in progress.
[Multipart dispatch](https://github.com/minio/minio-go/blob/v7.1.0/api-put-object-streaming.go#L41-L51),
[buffer/abort path](https://github.com/minio/minio-go/blob/v7.1.0/api-put-object-streaming.go#L278-L364).
Inference: a checked maximum below 200 MiB for **every** generated object
(including oversized tree packs and indexes) can exclude new multipart for this
exact client profile. Existing multipart residue must still be counted. If larger
objects are allowed, reserve upload identities/parts/bytes across failed attempts,
including completion ambiguity; an abort attempt is not measured reclamation.

There are two retry layers. MinIO defaults to ten request attempts and checks
body seekability. Restic rewinds and retries Save; its retry policy changes with
the backend-error feature flag, enabled by default here as Beta. The global
wrapper supplies 15 minutes, and the new policy uses exponential time-based
retry rather than the legacy ten-retry cap.
[MinIO retry default](https://github.com/minio/minio-go/blob/v7.1.0/retry.go#L31-L87),
[request retryability](https://github.com/minio/minio-go/blob/v7.1.0/api.go#L606-L646),
[restic retries](https://github.com/restic/restic/blob/v0.19.1/internal/backend/retry/backend_retry.go#L90-L161),
[feature registration](https://github.com/restic/restic/blob/v0.19.1/internal/feature/registry.go#L14-L22),
[Beta default](https://github.com/restic/restic/blob/v0.19.1/internal/feature/features.go#L35-L42),
[wrapper timeout](https://github.com/restic/restic/blob/v0.19.1/internal/global/global.go#L547-L570).

Conditional source bound: pinned backoff 4.3.0 defaults to jitter factor 0.5;
restic sets an initial interval of one second and multiplier two. Every scheduled
ordinary retry therefore waits at least 0.5 seconds. The 900-second elapsed limit
gives the deliberately loose ceiling `1 + floor(900 / 0.5) + 1 = 1802` backend
invocations per Save: initial invocation, scheduled retries, and an extra slot
for restic's mandatory-at-least-one-retry override after an already slow first
invocation. Backoff resets once per operation, not after each failed attempt.
[Jitter/elapsed calculation](https://github.com/cenkalti/backoff/blob/v4.3.0/exponential.go#L70-L87),
[stop and interval logic](https://github.com/cenkalti/backoff/blob/v4.3.0/exponential.go#L149-L197),
[retry loop](https://github.com/cenkalti/backoff/blob/v4.3.0/retry.go#L63-L109),
[restic override](https://github.com/restic/restic/blob/v0.19.1/internal/backend/retry/backend_retry.go#L66-L118).
This assumes ordinary system timer/monotonic-clock semantics and this exact
feature/profile. Combining ten inner request attempts conservatively gives
`18020` attempts for a single-PUT Save, not a measured count. Treat every ambiguous
PUT as possibly committed; retrying the same key does not earn storage credit.

Unresolved production proof: validate the complete single-PUT call chain and
counter against response-loss faults, then compose it with every command/lock
write/delete; alternatively enforce a smaller counted write boundary. This loose
bound will refuse many useful backups, and is not itself authorization. Five
connections is a simultaneous-worker ceiling, not a lifetime PUT ceiling.
On versioned
storage, repeated successful writes to the same ciphertext key can retain
multiple versions; use the existing accounting note's physical semantics.

Locks serialize time, exclusivity, host/user and process identity. Refresh writes
a new encrypted lock before removing the old one. The repository refresher ticks
every five minutes, can force a stale refresh, and calls ordinary Refresh with
`context.TODO()`.
[Lock schema/acquisition](https://github.com/restic/restic/blob/v0.19.1/internal/restic/lock.go#L29-L132),
[refresh writes](https://github.com/restic/restic/blob/v0.19.1/internal/restic/lock.go#L288-L356),
[refresh worker](https://github.com/restic/restic/blob/v0.19.1/internal/repository/lock.go#L109-L165).
Inference: reserve all lock writes/deletes for every child command, including
retention inspection, check, snapshot inspection and journal dump, plus retries
and cleanup grace. The store's timeout starts cancellation; it is not evidence
that no background write or provider completion survives that instant. Source
inspection does not prove an exact lock-write count for the production lifecycle.
Both ordinary snapshot `cat` and `dump` acquire read locks unless `--no-lock` is
supplied. [Cat](https://github.com/restic/restic/blob/v0.19.1/cmd/restic/cmd_cat.go#L64-L75),
[dump](https://github.com/restic/restic/blob/v0.19.1/cmd/restic/cmd_dump.go#L125-L148).

## Prune peak and local resources

Prune selects by old indexed pack sizes. It copies kept blobs into new packs,
flushes them, rewrites indexes, then removes obsolete packs; initial unreferenced
pack deletions can fail without stopping this flow. Dry-run returns before those
effects and explicitly allows varying plans. `--max-repack-size=0` can still
require rewritten indexes. [Prune selection/order](https://github.com/restic/restic/blob/v0.19.1/internal/repository/prune.go#L469-L599).

Repack reads/decrypts blobs and saves them again, so old compression ratios do not
bound newly encoded length. It uses `connections - 1` download workers for the same
repository. [Repack](https://github.com/restic/restic/blob/v0.19.1/internal/repository/repack.go#L100-L143).
Index rewriting reads old indexes, can rewrite those containing kept packs as well,
saves replacements before deleting obsolete indexes, and uses CPU-derived loader
and saver concurrency.
[Index rewrite](https://github.com/restic/restic/blob/v0.19.1/internal/repository/index/master_index.go#L357-L531).

Proposed conservative starting envelope: authenticated complete **repository**
counts/lengths for every current index, pack/blob entry and referenced tree, with
maximum plaintext blob/tree/index lengths, not only current source sizes. Reserve
as if all currently indexed blobs eligible for the configured repack could be
written, all affected index entries rewritten and all prior objects retained at
peak. This overapproximates selection but is attached to an executable fixed prune
profile. Use the formulas above with observed historical plaintext sizes and
counts; include repack-created indexes and later rewritten entries separately.
Do not count duplicates as free before validating them. A smaller envelope needs
an exact observed execution plan bound to the same repository state, not parsing
human dry-run totals.

Conditional peak rule: `current physical usage + reserved physical additions <=
budget`, without subtracting planned deletes. Only a complete subsequent physical
observation can release space. Failed deletion, interrupted/repeated prune and
version history keep old payload resident. A new attempt needs a new census and
reservation; do not reuse a spent allowance. Provider physical translation of the
payload/object/key/attempt bound is still missing.

Packs are staged in temporary files until upload, even with `--no-cache`. Unix
tempfiles are immediately unlinked but remain open; successful upload closes the
file. An unbuffered upload queue has one worker per connection.
[Tempfile lifecycle](https://github.com/restic/restic/blob/v0.19.1/internal/repository/packer_manager.go#L189-L260),
[Unix tempfiles](https://github.com/restic/restic/blob/v0.19.1/internal/fs/file_unix.go#L15-L26),
[upload queue](https://github.com/restic/restic/blob/v0.19.1/internal/repository/packer_uploader.go#L22-L53).
The merge path copies one pending pack into another without an explicit close of
the source in that function; do not assume a directory listing captures scratch
or that immediate garbage collection releases all descriptors.
[Pack merging](https://github.com/restic/restic/blob/v0.19.1/internal/repository/packer_manager.go#L74-L106).

Inference: a scratch reservation must include open/unlinked staging, merge overlap,
filesystem allocation/metadata and any multipart buffers. Prove a tight concurrent
file bound or reserve the operation's complete generated pack payload plus merge
overlap on a separately bounded scratch filesystem. A bound that requires a
second full registry-sized allocation must refuse when that allocation is absent;
it must not spool onto host root. Enforce mount/byte/inode capacity before launch
and observe actual held allocation, not `du` over visible filenames.

Existing repository indexes, directory node futures/JSON buffers, per-file chunk
IDs, compression workers and repack range buffers consume memory independently of
new file bytes. The index source's approximate bytes-per-blob commentary excludes
allocation overhead and assumes average pack occupancy; it is not an RSS ceiling.
[Index representation](https://github.com/restic/restic/blob/v0.19.1/internal/repository/index/index.go#L22-L47),
[range allocation](https://github.com/restic/restic/blob/v0.19.1/internal/repository/repository.go#L1024-L1053),
[CPU/file worker defaults](https://github.com/restic/restic/blob/v0.19.1/internal/archiver/archiver.go#L128-L155).
Inference: an installed memory/process ceiling and validated runtime CPU profile
are required to protect the host. Successful completion within that ceiling still
needs measured/adversarial evidence for the admitted source/repository class;
`GOMEMLIMIT`, chunk maximum or zstd decoder maximum alone is not a whole-process
success guarantee. No total memory envelope is proved here.

## Next implementable boundary and required proofs

Extend the real admission/store boundary, preserving the current refusal until
all required evidence exists. Proposed records, expressed as responsibilities:

| Record/effect       | Required content and consumer                                                                                                                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SourceShape`       | Canonical stopped mount identities, journal revision, logical bytes, directory-entry/file/tree counts, per-file chunk-reference bounds, metadata serialization bounds and maximum tree size; observed with early bounded traversal and held through backup.                                                                                         |
| `RepositoryShape`   | Immutable repository ID/format, complete current pack/index/snapshot identities and version census hash, historical blob/reference counts and plaintext maxima; authenticated parser with its own bounded memory/read limits.                                                                                                                       |
| `BackupProfile`     | Actual binary/config hashes and resolved defaults, CPU/concurrency ceiling, temp mount/byte/inode allocation, memory/process ceilings, command count/deadlines, object maximum, complete retry/lock-write envelope. Explicit flags are optional when resolved defaults are proved and enforced.                                                     |
| `BackupReservation` | Durable operation/repository/source/profile evidence hashes; separate new pack/index/snapshot/lock payload bytes and object counts, key bytes, PUT/version/delete/multipart attempts, remote physical peak, local scratch/inodes/memory; status distinguishes unknown from authorized.                                                              |
| `executeRetention`  | Separate fixed root effect consuming the fresh reservation and existing retention catalogue/version hash, exact eligible IDs, retained/pinned IDs and canonical revision. Reserve before lock-writing commands; forget only exact eligible IDs, prune under its fixed profile, recensus and verify a retained restore before reporting reclamation. |

Repeated `admit` calls must validate/reuse one durable unspent reservation for the
same operation, not prune or allocate another allowance. Consume writes against
the authorized effect phase. Stale source/repository/profile evidence, unknown
file/part accounting, missing workspace or incomplete recovery coverage must produce
a modeled refusal before destructive effects. These are concrete proposals for
the existing production callback and action dispatcher, not a standalone planner.

Unexecuted production-path proofs required before opening admission:

- Same logical bytes with many empty/tiny files, hardlink names, deep/wide paths,
  escaped names, xattrs, sparse files and a maximum tree; remove each shape guard
  and observe its actual consumer exceed/reject the claimed bound.
- Tiny files and chunk-boundary extremes; incompressible and expanding compressed
  payloads; encrypted pack/index/snapshot/lock sizes and counts versus reservation.
- Old repositories whose indexes or trees exceed the new source shape; duplicates,
  large compressed historical trees, unknown format and malformed/oversize indexes.
- Lost PUT/complete responses, repeated successful versions, exhausted retry count,
  lock refresh/stale refresh and cancelled cleanup; show additions stay reserved.
- `--max-repack-size=0` with rewritten indexes; repack plus index coexistence;
  deletion failures, kill/restart and full recensus before retry. Independently
  restore a kept snapshot after actual pruning while pins and coverage survive.
- Scratch byte/inode exhaustion including unlinked files, CPU changes and enforced
  memory exhaustion through the actual launcher; removing each enforcement must
  break the protective negative. A resource kill must preserve the prior receipt
  and prevent automatic reopening/admission.

No implementation/proof checkboxes were changed. No dependency/build, native
fixture, provider, root, remote-host, credential/helper or notification calls were
performed. Only this new Markdown file is owned by the research task; its scoped
format/check outcome is recorded in the handoff, not inferred from source reading.

## Next production funding slice — 2026-11-09

Read-only investigation, 2026-11-09, against the assigned source revision
`1bf00382aa09258e55075560ab88c562fc3922f2`. This proposes a next slice; it records
no executed test, native, installed, provider or activation proof.

**No self-contained slice that opens admission is justified by the available
ordinary-file/local-repository evidence.** The smallest coherent next production
slice is **fund normal-lock repository inspection through the existing effect
ledger**, conditional on a complete executable inspection profile. That missing
producer is a dependency, not authorization to widen stopped work. An extra guard
inside today's always-refusing callback would not advance an admitting
implementation. The existing stop remains in force.

### Observed production gaps

- [`admitRegistryBackup`](../../tools/tool-fleet/src/registry-backup-admission.ts)
  unconditionally refuses `backup-budget-unavailable`.
- [`executeRegistryBackupAction`](../../tools/tool-fleet/src/registry-maintenance-backup.ts)
  calls that port before `openVersions`. It later discards the value returned by
  `store.inspectRetention`. Its admission arguments contain operation/source
  capacities and, for snapshots, raw source metadata; they contain neither the
  complete stored-byte census nor a funded command profile.
- [`RegistryS3Census`](../../tools/tool-fleet/src/registry-s3-census.ts) already
  carries all-version/upload/part identities and `payloadBytes`. Under the approved
  [measure](../../openspec/changes/bound-registry-storage/specs/registry-storage-lifecycle/spec.md#requirement-backup-budget-measure),
  that total is the required existing stored-size measure. Billing evidence adds
  no prerequisite. But [`RegistryBackupVersionStore`](../../tools/tool-fleet/src/registry-backup-provider.ts)
  exports only raw-lock census/removal and snapshot-version projection; its
  `census()` is **not** the whole-repository byte census.
- [`openRegistryBackupReservation`](../../tools/tool-fleet/src/registry-backup-reservation.ts)
  persists `scope: 'effect-lineage-only'`. `consumeEffect` durably consumes the real
  fixed slot before `store.run` launches Restic, and `settleEffect` acknowledges
  terminal execution. Neither operation reserves physical additions or releases
  measured liabilities. Renaming that scope would invent authority.
- [`createRegistryBackupStore`](../../tools/tool-fleet/src/registry-backup-store.ts)
  uses ordinary locked `snapshots`, `dump`, `check`, backup and restore commands.
  Only config/raw-lock inspection uses `--no-lock`. Thus even the first useful
  retention catalogue may add lock objects/versions before snapshot creation.

### One proposed TDD slice: funded inspection effects

Scope: make the first `retention-list`/`retention-journal` and subsequent inspection
lock-writing slots consume **one durable stored-byte reservation**, through
`executeRegistryBackupAction` → the production admission adapter → the existing
`RegistryBackupEffectPort` → `store.run`. Snapshot, forget/prune and restore grants
remain unavailable until their separate required envelopes exist. This is an
ordered implementation slice of Task4.3, not a replacement endstate.

Required production wiring:

1. Expose a bounded complete repository file/part observation from the existing
   provider adapter, retaining scope, versioning, canonical census hash and exact
   listed sizes. Keep this distinct from its raw-lock `census()` and snapshot
   projection. Open this read-only adapter before asking to fund any normal-lock
   command. Keep config/raw-lock authentication read-only and under existing
   lineage authority; do not bootstrap funding by running a locked command.
2. Derive inspection additions from an authenticated, fixed executable profile:
   the finite set of actual slots, complete per-command lock creation/refresh/
   deletion/retry/version liability, command deadlines, and separately enforced
   local resource requirements. No caller `maximumNewBytes`, source filesystem
   capacity, elapsed success, or arbitrary supplied byte allowance may replace
   that derivation. Preserve absent/unknown as refusal.
3. Persist that census/profile/operation binding and outstanding liability beside
   existing effect history before the first funded slot. Admission must reuse it
   across repeated `prepare`/inspection calls. `consumeEffect` must check its exact
   slot and funding before publishing the existing consumed ticket; settlement
   must not refund it. Apply `current stored bytes + outstanding additions <=
107374182400` with checked arithmetic, counting all versions and uploaded parts.
   Do not subtract prospective deletion or credit the same commitment twice.
   Physical liability release/retry needs a later complete observation and exact
   reconciliation, rather than `settleEffect` or a successful delete response.

These are proposals. The production facts above do not establish an implemented
funding interface or a complete grant-producing profile.

### First failing consumer test and local evidence limits

Proposed RED: with a complete **test-derived** inspection profile and owned local
repository, the actual store's first locked catalogue command receives a durable
funded ticket before it runs. At an exact boundary, existing bytes plus that
command's reserved lock/version additions fit; adding one noncurrent version or
uploaded-part byte refuses before the same child runs, preserving the prior
verified receipt. Current unconditional admission fails the positive control.

Use the actual admission/ledger/store consumer, not a mock `admit: () =>
Promise.resolve()` or an isolated arithmetic function. The existing
[`registry-backup-retention-action.fixture.ts`](../../tools/tool-fleet/src/registry-backup-retention-action.fixture.ts)
models the store and root prerequisites; it establishes call ordering, not this
funding proof. The
[`local repository adapter`](../../tools/tool-fleet/src/registry-backup-local.fixture.ts)
has current files only; it cannot establish S3 history/multipart semantics.

Candidate adjacent negatives: remove physical-ticket validation and observe the
unfunded child run; remove the history/part contribution and observe the boundary
case run; break persistence and observe no launch; repeat admission after a spent
or uncertain effect and observe no refill. Terminal execution must retain the
liability. A real local Restic repository can compare actual lock-file additions
with the test envelope and exercise owned-file persistence/replay faults. Actual
SDK controlled transport can supply versions/parts and response-loss cases without
provider access. These would prove their declared local boundaries only.

No such test was run here. Positive controls are essential: refusal-only tests
would all pass against today's unconditional denial and would not prove funding.

### Dependency stopping an honest grant now

The existing [workspace research](registry-backup-workspace.md#upload-attempts-and-lock-objects)
derives conditional retry/lock formulas but explicitly leaves the complete
single-PUT retry chain and every command/lock refresh composition unproved. Its
[local resource discussion](registry-backup-workspace.md#prune-peak-and-local-resources)
also leaves whole-process memory and held scratch capacity unproved. The present
profile hash in `executeRegistryBackupAction` identifies binary/configuration and
`restic/no-cache/locked-commands/v1`; its adjacent comment explicitly excludes full
resource/provider evidence. A finite command timeout is not by itself a complete
write-attempt or successful-resource envelope.

Consequently, the positive test above needs a **new derived and enforced profile
producer**, not a fabricated fixture promoted to trusted production evidence.
Ordinary owned files and a disposable repository can help develop/test its counting
and persistence consumers. They cannot certify the current installed execution
profile or supply missing enforcement. Developing schemas, exposing the whole
census, and writing a ledger reducer are ordinary-source work; independently they
would be incomplete plumbing. Do not promote those pieces to funding completion.
The integrated slice needs that producer before it can establish a real positive
grant. This investigation does not propose implementing or investigating stopped
authority/profile work to obtain it. Retain the refusal and report the dependency.

Full snapshot funding additionally needs complete resolver/ancestor/xattr context,
historical content references, encoded pack/index/snapshot bounds and repository
shape; current [`RegistryBackupSourceObservation`](../../tools/tool-fleet/src/registry-backup-source.ts)
explicitly excludes them. Full Task4.3 still includes exact protected retention,
bounded prune coexistence, measured reclamation and independent retained restore,
as recorded in [tasks](../../openspec/changes/bound-registry-storage/tasks.md).
No product migration or reduced recovery policy is proposed.

Only this note was written. No runtime edits, tests/native execution, installation,
host/provider requests, protected-file reads, deployment or notifications occurred.
