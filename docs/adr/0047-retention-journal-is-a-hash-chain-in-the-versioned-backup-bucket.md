# The retention journal is a hash chain in the versioned backup bucket

[ADR 0038](0038-retention-journal-survives-website-database-restore.md) requires a remote, monotonic record of retention decisions. We keep it as immutable event objects plus one rewritten head object under `retention-journal/<environment>/` in the existing versioned Hetzner bucket. Each event carries the SHA-256 of the previous one. The head's provider-assigned version id is read back and recorded in SQLite. This was chosen because Hetzner Object Storage does not support conditional PUT on versioned buckets, so the provider cannot enforce compare-and-swap. Instead, monotonicity is held by a cross-process policy lock and a single serving process. It is verified by every reader: each write is read back and compared, and every startup and policy change walks the chain from the database's applied position to the head. Missing, gapped, stale, forked or foreign state is refused. A lost race is detected, not prevented.

## Pinned invariants

- An event's hash is the SHA-256 of its canonical bytes **including the trailing `\n`**: sorted keys, no whitespace, every field except `hash`. Changing any of these rules changes every hash in an existing journal.
- Once a subject is `erased`, any update of its `erasure_state`, `erasure_sequence` or `erased_at` aborts in SQLite (`retention_subject_erasure_final`). Replay of an `erase` event therefore skips the state change for an already-erased subject, as `eraseSubjectContent` does, and never re-stamps it.
- A record is `truncated` when its bytes lack the final newline or when Bun's `JSON.parse` reports the end of input. The second case matches Bun's message text, which a test pins. A different runtime must re-pin that test.
- The head names the provider version of its event; a reader refuses as `forked` a head whose `eventVersionId` differs from the event object's current version.

## Considered options

- A Git-backed journal would give true fast-forward compare-and-swap. It was rejected because the pod would need a write deploy key, and the private repositories must stay unreachable from the cluster. It is the fallback if the bucket ever loses versioning.
- Litestream or another asynchronous replica would be a queued copy, which the spec forbids as authority.
- A new provider with Object Lock and conditional writes would need new money and credentials.
- Kubernetes API objects as the head would give compare-and-swap for free, but etcd shares the database host and the pod has no service-account token.
- An optional compare-and-swap witness in a second, unversioned bucket remains possible as explicit configuration. It is never auto-detected.

## Consequences

The record format and replay semantics are hard to change: every reader must keep accepting `puni-retention-journal/1`. Pod start depends on reading the bucket. The pod holds the backup credentials, including delete rights on the backup prefix. Records carry no signatures, because the threat model is operational error and host loss, not a hostile storage operator.
