# Same-inode repair research and pending implementation

Status: researched candidate, 2026-11-05. No repair implementation, accepted repair budget, disk write, seed regeneration or guest retry follows from this document. Canonical acceptance remains 4/11 and Task97 is open. Independent review of the complete repair accounting and vendor-kernel qualification remains necessary.

## Measured source and host facts

The committed, independently reviewed read-only observer measured the original failed guest disk once. [Source evidence](evidence/repair-source.json) binds source revision, exact helper digest, original inode/timestamps, map digest, limits and unchanged metadata. It reports 154128384 missing data bytes, 4677648384 UNWRITTEN bytes and 28672 unclassified residual allocated bytes. The old st_blocks deficit of 154099712 bytes is not the missing-data quantity. Residual allocation is not identified metadata.

[Host evidence](evidence/repair-host-profile.json) binds the selected ext4 mount, actual newline-separated proc options, EXTENTS-only inode flags and a stable existing 79-byte regular file with exactly 4096 allocated bytes on that mount. With 4096-byte filesystem blocks and inline accounting excluded, whole-cluster ext4 accounting gives a 4096-byte allocation quantum. Actual options include delalloc, dioread_nolock and data=ordered. These dated observations qualify a candidate profile; they do not certify the complete vendor kernel or repair algorithm.

## Finite allocation candidate

An extent insertion can require split metadata plus root growth: charge six metadata clusters per insertion. A whole 8GiB fallocate does not select the small-request NO_NORMALIZE path. ENOSPC retry and progress behavior means a simple 5D allowance is not established. See Linux v7.0 [extent allocation](https://raw.githubusercontent.com/torvalds/linux/v7.0/fs/ext4/extents.c), [retry accounting](https://raw.githubusercontent.com/torvalds/linux/v7.0/fs/ext4/balloc.c) and [cluster allocator](https://raw.githubusercontent.com/torvalds/linux/v7.0/fs/ext4/mballoc.c).

The conservative candidate preallocates each originally missing 4096-byte block once with one fixed syscall and no userspace retry. Count four kernel attempts, each with one data plus six metadata clusters: 112KiB per missing block, or 28D overall. Group at most 256 calls per acknowledged step, reserving 28MiB for that step. Positive progress must terminate the one-block call; unsupported syscall fallback or unexpected behavior refuses.

For initialization, retain one confined writer and 1MiB monotonic same-byte rewrite steps. O_DIRECT can fall back to buffered writes inside the kernel; a successful userspace return does not exclude that path. Under the precisely qualified dioread_nolock/delalloc/regular-EXTENTS/non-data-journal predicate, pre-I/O mapping uses unwritten extents and conversion completes after I/O. The candidate charges two insertions per block, including failure, rounded from 12MiB to 16MiB per step. Across 8192 steps that is 128GiB gross. Require the written range initialized before each next acknowledgement and refuse short/error/uninitialized completion without retrying the range. See [direct and buffered dispatch](https://raw.githubusercontent.com/torvalds/linux/v7.0/fs/ext4/file.c), [mapping](https://raw.githubusercontent.com/torvalds/linux/v7.0/fs/ext4/inode.c), [predicate](https://raw.githubusercontent.com/torvalds/linux/v7.0/fs/ext4/ext4_jbd2.h) and [end-I/O conversion](https://raw.githubusercontent.com/torvalds/linux/v7.0/fs/ext4/page-io.c).

Do not release this gross reservation based on fsync or st_blocks alone. A journal commit can publish completion before allocator callbacks finish; delayed frees can remain unavailable. The candidate gives no credit for any reclamation through the attempt. See [JBD2 commit callbacks](https://raw.githubusercontent.com/torvalds/linux/v7.0/fs/jbd2/commit.c) and [ext4 freeing](https://raw.githubusercontent.com/torvalds/linux/v7.0/fs/ext4/mballoc.c).

## Accounting decision still requiring review

The existing 10GiB staging calculation sums retained inode st_blocks. Preserve it, its 160MiB outside reservation, raw final allowance and existing 50/40GiB backing floors. The candidate adds a separate host-filesystem gross reservation covering causal allocation and deferred-reclamation debt; it must not hide that debt, raise the staging limit or count existing raw bytes twice. Independent review must confirm this strengthens the established budget contract rather than redefining it.

For measured D=154128384, 28D=4315594752 and 128GiB+28D=141754548224 bytes. Adding the unchanged 50GiB initial backing floor gives 195441639424 bytes before other outstanding reservations. Dated available backing was 220938399744 bytes. That arithmetic fits this observation only; complete fresh inventory, other reservations, vendor-path qualification and source review remain open. This is temporary filesystem headroom, not additional RAM or a retained second disk.

## Minimal implementation and lineage

Reuse the existing raw coordinator for original source/input/creator/native joins, ownership, finite service caps, parent acknowledgement, durable counters and independent cleanup. A trusted in-unit worker owns lifecycle metadata; only its separate byte-writer child receives the restrictive no-exec/geometry policy. Applying that policy to the supervisor would deny later required lifecycle calls.

Before any mutation, preserve original receipts and failed attempts, bind the exact original inode and compute its complete logical SHA256. After bounded preallocation and same-byte rewriting, require complete before/after hash equality, strict initialized allocation, original inode/length, bounded allocation, authentic counters and cleanup. A final successful map/hash cannot retroactively establish peak safety. Keep native wide identities and nanosecond times as exact decimal strings across new TypeScript/Python contracts.

Publish a distinct repair receipt. Explicit seed-v2/guest-v2 consumers must join it and label the disk continued-guest. Preserve exact v1 consumers and immutable historical ISO; do not overwrite old allocation evidence, reimage, allocate another 8GiB disk or describe the boot-modified disk as pristine. A new bootstrap-bound seed needs a new instance identity and request. None has been created.

Next work is independent accounting/design review, then ordered TDD of repair/lineage with production-path negative proofs and separately bounded tiny native controls. Only reviewed source plus complete fresh admission could authorize one actual repair and subsequent guest attempt. Authenticated Kubernetes/Flux rehearsal and live telemetry/history/recovery acceptance remain separate obligations.
