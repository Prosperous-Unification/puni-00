## Technical shape

Each attempt retains its phase-one journal unchanged. A sibling `<attemptId>.operations` directory contains closed slots `network.json` and `registry.json`, mode 0700/0600 and current-user ownership. Slot records bind schema version, lab, attempt and daemon and contain pending or created state; only created includes a full 64-character lowercase Docker ID. Unknown fields are rejected.

`executeDirectCreation` requires a creating journal, reserves a pending slot with exclusive non-following creation, fsyncs its file and directory ancestry, and calls Docker. Only the returned stdout from the existing network-create or detached-registry-run command is accepted, with at most one trailing newline. A lost response or malformed stdout leaves pending evidence. Registry reservation requires a created network record. Exclusive completion locking, fsynced replacement, atomic rename, and directory fsync precede success. Failures stop the caller before its next creation; no retry or adoption occurs.

`readCreationOperation` reads via nonblocking O_NOFOLLOW descriptors and validates the opened regular file, owner, permissions, strict schema and complete expected binding. Existing phase-one validation is shared through exported boundary helpers; its lifecycle and deletion refusal do not change.

`assessCreationReceipts` is a read-only library boundary with an injected exact-ID inspector. It checks the current daemon, both slots and every inspected full ID and lab label. Docker's ID-shaped name lookup cannot satisfy a differing returned ID. Network endpoints may contain only the receipted registry, and registry networks must contain the receipted network with no foreign attachment. Later k3d endpoints therefore refuse this bounded assessment. The callback returns normalized inspection facts; their schema is validated at this boundary. The assessment has no command runner, removal callback or cleanup authority. Registry receipts do not own volumes.

Ordinary `downLab`, recovery CLI refusal, phase-one consume refusal and k3d `--no-rollback` retain their existing behavior. Operation directories survive ordinary down beside attempt history.
