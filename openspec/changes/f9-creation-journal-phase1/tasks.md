## 1. Creation boundary

- [x] 1.1 Add exclusive durable owner-only journal creation and strict reading; prove occupied attempt, invalid identity, public directory, absent/unreadable/malformed/foreign/symlink consuming negatives.
- [x] 1.2 Add serialized atomic terminal transitions and creation orchestration; prove concurrent attempt isolation, occupied transition lock, terminal refusal, and callback failure persistence.

## 2. Lifecycle integration

- [x] 2.1 Wire real k3d up through durable reservation before mutations; prove offline real-up injected create failure sees a journal and persists failed without cleanup.
- [x] 2.2 Preserve historical attempts across ordinary up/down/up and report manual recovery limits; prove two distinct ready journals survive ordinary teardown.
- [x] 2.3 Add separate consuming lifecycle refusal while recovery remains disabled; prove valid journal still cannot authorize deletion.

## 3. Evidence

- [x] 3.1 Watch production-path fault injections fail, restore checks, run scoped verification and record results and skipped checks in verify.md.
