# Inspection-command lock additions

Source investigation, 2026-11-09, for Task 4.3. **A conditional ciphertext-size
bound per lock Save is available; the current command profile supplies no proved
finite total lock-Save count.** Therefore this note does not establish a complete
per-command reservation, resource envelope or admitting implementation. No runtime
or installed evidence was gathered.

## Owning commands and existing limits

[`createRegistryBackupStore.inspectRetention`](../../tools/tool-fleet/src/registry-backup-store.ts)
sequentially runs:

| Command                                                             | Durable effect slot              | Output bound |
| ------------------------------------------------------------------- | -------------------------------- | ------------ |
| `snapshots --json`                                                  | `retention-list`, kind `lock`    | 8 MiB        |
| `dump <lastVerified.snapshotId> <receipt.journalPath>/journal.json` | `retention-journal`, kind `lock` | 16 MiB       |

The second is skipped when `lastVerified === null`. Both share the inspection's
60 second cancellation signal; `run` additionally creates its 1 hour per-child
cancellation timer. The local
[`awaitRegistryBackupMember`/`awaitRegistryBackupChild`](../../tools/tool-fleet/src/registry-maintenance-process.ts)
send SIGINT followed by a scheduled SIGKILL after 5 seconds. These are cancellation
mechanisms, not independently proved write-count or successful-resource ceilings.
The commands use a read lock, defer unlock, and perform no explicit repository
content write beyond the lock lifecycle:
[runSnapshots](https://github.com/restic/restic/blob/v0.19.1/cmd/restic/cmd_snapshots.go#L77),
[runDump](https://github.com/restic/restic/blob/v0.19.1/cmd/restic/cmd_dump.go#L125),
[openWithReadLock](https://github.com/restic/restic/blob/v0.19.1/cmd/restic/lock.go#L35).

## Lock lifecycle facts

The pinned [`restic.Lock`](https://github.com/restic/restic/blob/v0.19.1/internal/restic/lock.go)
has seven serialized fields: `time`, `exclusive`, `hostname`, `username`, `pid`,
optional `uid` and `gid`. There is no extra `created` field. `NewLock` samples
time/PID/hostname and current user, checks competing locks, creates one candidate,
sleeps 200 ms, then rechecks competition. Post-create failure attempts candidate
removal. Its internal four-pass competition check performs reads, not extra
candidate writes. `Refresh` changes time, creates a replacement, updates its ID,
then removes the previous key. `RefreshStaleLock` requires the previous key to
exist both before and after replacement creation; failure attempts replacement
cleanup. `Unlock` removes the known key using a context whose cancellation can be
delayed one minute. User lookup failure leaves empty user fields; malformed
numeric UID/GID conversion instead fails before creation.
[UID/GID conversion](https://github.com/restic/restic/blob/v0.19.1/internal/restic/lock_unix.go#L16).

[`repository.locker.Lock`](https://github.com/restic/restic/blob/v0.19.1/internal/repository/lock.go#L41)
retries `NewLock` on an already-locked outcome. **Default `--retry-lock=0` does not
prove two candidate calls:** both its retry timeout and retry sleep are zero;
`select` can repeatedly choose the sleep branch before choosing the final-attempt
branch. Go supplies no deterministic fairness count. Existing contention before
creation adds no object, but a conflict appearing at the post-create check can
turn each successful candidate into another retry. The 200 ms sleep supplies delay,
not an enforced attempt counter. A claim of one candidate additionally needs
proved conflict exclusion throughout acquisition.

The same
[repository locker](https://github.com/restic/restic/blob/v0.19.1/internal/repository/lock.go#L109)
has one serial refresh executor, a 5 minute ticker and an expiry monitor polling
each second. Its refreshability threshold is 22.5 minutes. The monitor uses Unix
time and requests a forced stale refresh, with at most one outstanding request;
successful forced refresh resets its sample, failure cancels the command.
Normal refresh calls `Refresh(context.TODO())`. Shutdown cancels and waits for
both goroutines before returning from `Unlock`; it does not concurrently run a
second refresh executor. A select may choose a ready refresh tick even after
cancellation. Cancellation therefore proves neither an immediate stop to new lock
Saves nor interruption of an already-running normal refresh.

## Conditional serialized/encrypted bound

Let `H,U` bound raw hostname/username bytes returned inside the actual child.
Go 1.26.4's default JSON string encoder gives `J(s) <= 2 + 6*byteLength(s)`.
[appendString](https://github.com/golang/go/blob/go1.26.4/src/encoding/json/encode.go#L946).
For a successful serialization, allocate 37 bytes for the quoted time, 5 for `false`,
20 for the signed amd64 `int` PID, and 10 each for the two uint32 IDs; retaining
omitted zero IDs is conservative. Time's successful RFC3339 encoder enforces its
year/zone bounds:
[MarshalJSON](https://github.com/golang/go/blob/go1.26.4/src/time/time.go#L1496),
[appendStrictRFC3339](https://github.com/golang/go/blob/go1.26.4/src/time/format_rfc3339.go#L58).

Counting seven keys, quotes/colons, six commas and braces gives the deduction:

```text
P <= 149 + J(hostname) + J(username) <= 153 + 6*(H + U)
```

[`SaveJSONUnpacked`](https://github.com/restic/restic/blob/v0.19.1/internal/restic/json.go#L22)
uses `json.Marshal`, without a newline. For format 1, ciphertext length is at most
`P + 32`. Format 2 compresses the plaintext with an extra format byte, then encrypts
it with a fresh nonce. Thus reuse the established encoder bound
`Z(n) = n + 14 + 3*(floor(n/131072)+1)` and reserve
**`E = Z(P) + 33`** for either supported format. This assumes the exact pinned
compression profile; no compression ratio is credited.
[saveUnpacked/compressUnpacked](https://github.com/restic/restic/blob/v0.19.1/internal/repository/repository.go#L418),
[crypto.Extension](https://github.com/restic/restic/blob/v0.19.1/internal/crypto/crypto.go#L14),
[encoder bound](registry-backup-workspace.md#conditional-encrypted-payload-and-object-bounds).

One `saveUnpacked` encrypts/hashes once before calling the backend retry wrapper.
Every replay of that Save uses the **same ciphertext/key**. A separate candidate
or refresh encrypts again; conservatively count a new key and all its versions,
even if time repeats. In-memory `verifyUnpacked` decrypts/compares, adding no PUT.
A failed Save may already have committed versions before returning an error;
those copies still count even when no lock ID is returned for cleanup.

`H,U` are required inputs, not supplied numerical bounds. The existing
[`RegistryBackupAttempt.utsHostname`](../../tools/tool-fleet/src/registry-backup-attempt.ts)
describes a 40 byte ASCII candidate; schema alone does not prove the actual child's
hostname. Username is independent: Go's
[Current](https://github.com/golang/go/blob/go1.26.4/src/os/user/lookup.go#L19)
caches a process-local answer, while the pure-Go
[account parser](https://github.com/golang/go/blob/go1.26.4/src/os/user/lookup_unix.go#L26)
has no username byte cap. Its
[fallback](https://github.com/golang/go/blob/go1.26.4/src/os/user/lookup_stubs.go#L21)
can consult environment. The current child's allowlist omits USER/HOME, but that
does not bound a successful account-file answer. No account file was read here.

## Additions, deletes and missing command multiplier

Under the staged fixed `s3.retries=1`, unchanged outer retries and the
nonempty HTTPS single-PUT prerequisites in
[the retry research](registry-backup-workspace.md#single-put-retry-chain-and-staged-execution-2026-11-09), use `A = 1802` possible
committed versions **per Save**, conditional on that research's timer semantics.
Require `E <= 209715200` before applying its single-PUT branch. For enforced maxima
`C_acquire`, `C_refresh`, `C_stale` of write-bearing candidate/normal/forced
replacement calls, the conditional deduction is:

```text
S = C_acquire + C_refresh + C_stale
possibly committed lock versions <= A*S
new stored lock bytes <= A*S*E
new multipart uploads/parts = 0
```

Do not multiply again for encryption verification. Request maxima bound possible
accepted copies, not observed copies; failures/response loss retain the full
liability until a complete physical observation establishes otherwise.

[`s3.Backend.Remove`](https://github.com/restic/restic/blob/v0.19.1/internal/backend/s3/s3.go#L355)
passes empty options; MinIO's
[`removeObject`](https://github.com/minio/minio-go/blob/v7.1.0/api-remove.go#L141)
therefore deletes without a version ID. With enabled versioning,
[DeleteObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html)
creates a marker and preserves stored object versions. No byte credit follows
from successful lock removal. Marker identities still consume census capacity;
their metadata/billing overhead is excluded by the approved size measure. Delete
calls have their own outer retry path and a bodyless transport path: the
nonempty-PUT request-count proof must not be relabeled an exact DELETE wire count.
This note derives no complete marker/request envelope.

The two commands currently lack proved `C_*` values. Neither their 60 second
cancellation signal, scheduled 5 second escalation, 1 hour secondary timer nor the
5 minute refresh cadence supplies an enforced creation count. Acquisition retries,
wall-clock changes/standby, delayed parent scheduling, forced refresh and in-flight
`context.TODO()` work invalidate an automatic “short command means one lock”
deduction. No scheduler/clock assumptions are introduced to fill that gap.

Future producer inputs must bind: actual child hostname and immutable user-resolution
ceiling; supported repository/compressor/binary/retry profile; enforced total
candidate/replacement and delete/marker limits through terminal child cleanup;
complete existing versions/parts; and durable one-use liability consumption/release.
Required future witnesses include post-create contention/reacquisition, lost PUT
responses, failed old-key deletion, periodic/forced refresh, cancellation during
normal refresh and cleanup, replay without refill, and a positive encrypted-length
comparison. Removing each counting/size consumer must break its production-path
negative. None was executed here. Resource, funding and admission completion remain
unproved; no stopped authority/profile work is proposed.
