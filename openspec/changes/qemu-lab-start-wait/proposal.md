# QEMU lab start waits for its owned process

`startQemuMachine` checked for the machine's owned process once, immediately after QEMU's daemonizing start returned. The pid file can still be absent, or name a process whose command line has not yet reached the machine's arguments, at that instant. CI failed `tools/tool-fleet/src/lab.test.ts` once on `QEMU did not leave … running` (2026-09-21, WBS 080.14), and the check carried a "not fault-injected" note.

Outcome: the start polls the existing ownership predicate until a bounded deadline (10 seconds by default). A delayed owned process succeeds. No pid file, a pid file naming another process, or a daemon that already exited fail when the deadline passes. A malformed or unreadable pid file still fails at once.

Non-goals: no change to process ownership rules, stop or delete deadlines, or the Multipass provider.
