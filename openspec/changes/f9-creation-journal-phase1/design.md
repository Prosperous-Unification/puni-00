## Technical shape

`creation-journal.ts` owns the strict boundary and attempt orchestration. A journal contains exactly schemaVersion, labId, attemptId, daemonId and state. The three lifecycle states are creating, ready and failed. These facts describe attempt execution; resource creation receipts and resource ownership remain future work.

The directory must already be owner-only and owned by the current user. Exclusive creation uses O_EXCL and O_NOFOLLOW, writes mode 0600, synchronizes the file and then its directory ancestry so newly created attempt directories are durable too. Reads open with O_NOFOLLOW and O_NONBLOCK and check the opened descriptor's owner, type and exact permissions. A FIFO is rejected by the opened-descriptor regular-file check instead of waiting for a writer. Schema validation rejects unknown fields. The supplied expected identity must match every identity field.

Each terminal transition takes an exclusive per-attempt directory lock. It reads validated creating state, exclusively writes and synchronizes a replacement, renames it atomically and synchronizes its directory. Existing locks fail closed, including locks retained by a crash; no automatic stale-lock reclamation exists. A failed synchronization propagates and may leave creating state or an orphan replacement; no consumer treats these as deletion authority.

`executeCreationAttempt` reserves before invoking its creation callback. Callback failure records failed before rethrowing, preserving both errors if failure recording also fails. Ready recording follows successful callback completion. The success announcement is published only after ready persistence succeeds. `upLab` uses this lifecycle around its existing mutation block. It stores journals in `.puni/fleet-labs/k3d/.attempts/<lab-id>` so ordinary teardown of `<lab-id>` runtime state preserves historical attempts.

`consumeCreationAttempt` is a separate lifecycle entry. It reads the strict journal then always refuses deletion. It has no command runner or deletion callback. Existing ordinary `downLab` remains name/label based and never consumes these journals. A later phase must prove exact resource creation identity before introducing a deletion executor. F9 recovery CLI remains disabled.

## Compatibility and manual operations

The ordinary up/down/up contract stays available, with distinct retained journal files. An up failure reports the attempt and journal path and requires manual inspection of exact resource identities. It does not present ordinary down as automatic recovery authority. Every k3d cluster-create explicitly passes `--no-rollback`: the pinned v5.9.0 CLI otherwise calls ClusterDelete internally after ClusterRun failure. This suppresses that automatic rollback, while actual resource inventory remains unknown and may require manual inspection. No legacy state is adopted or silently assigned an attempt.

## Verification

Use actual filesystem persistence and fixture binaries for the real k3d caller. Separate missing and unreadable consumer tests are required. Mutate production checks and break synchronization dependencies, observe negative tests fail, restore code, then run scoped Bun tests and Nx lint/typecheck. No live infrastructure or host gate is part of this phase.

## Review corrections

The initial candidate's network-create failure fixture did not exercise k3d's automatic rollback.
The added k3d-stage fixture follows the pinned CLI's executed flag semantics: it creates a partial
fixture, deletes it on failure when rollback is enabled, and leaves it when `--no-rollback` is
passed. This is offline contract evidence, not live resource ownership proof.

Owner checks have separate consuming negatives using an injected process UID provider in isolated
subprocesses, while the actual directories/files and their 0700/0600 modes remain unchanged. These
prove each UID comparison independently and are explicitly not actual foreign-owned inode tests.
The real FIFO test uses a kernel FIFO with a bounded subprocess to detect a blocking open.
