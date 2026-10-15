## 1. Creation boundary

- [x] 1.1 Add exclusive durable owner-only journal creation and strict reading; prove occupied attempt, invalid identity, public directory, absent/unreadable/malformed/foreign/symlink consuming negatives.
- [x] 1.2 Add serialized atomic terminal transitions and creation orchestration; prove concurrent attempt isolation, occupied transition lock, terminal refusal, and callback failure persistence.

## 2. Lifecycle integration

- [x] 2.1 Wire real k3d up through durable reservation before mutations; prove offline real-up injected create failure sees a journal and persists failed without cleanup.
- [x] 2.2 Preserve historical attempts across ordinary up/down/up and report manual recovery limits; prove two distinct ready journals survive ordinary teardown.
- [x] 2.3 Add separate consuming lifecycle refusal while recovery remains disabled; prove valid journal still cannot authorize deletion.

## 3. Evidence

- [x] 3.1 Watch production-path fault injections fail, restore checks, run scoped verification and record results and skipped checks in verify.md.

## 4. Astra review corrections

- [x] 4.1 Verify pinned k3d v5.9.0 rollback behavior, disable automatic failure rollback, and prove a failure inside real-up k3d creation preserves its partial offline fixture; watch removing `--no-rollback` fail that test.
- [x] 4.2 Open journals nonblocking and validate the opened regular-file descriptor; prove an actual FIFO refuses promptly, then watch removing O_NONBLOCK or the regular-file check fail the consuming test.
- [x] 4.3 Add separate isolated process-UID mismatch consuming negatives for directory and file; selectively remove each UID comparison and watch its test fail. Record that these inject process identity and do not establish a real foreign-owned inode proof.
