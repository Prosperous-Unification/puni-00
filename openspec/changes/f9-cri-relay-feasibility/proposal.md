## Why

The existing explicit native relay probe exchanges generic bytes with Python fixtures. It cannot answer whether the one-connection relay accepts real crictl HTTP/2 exchanges with a disposable containerd. The authorized next spike needs observed protocol and failure evidence before production transport design proceeds.

## What Changes

Add an explicit unintegrated crictl probe mode and serial disposable-runtime observations for Version, ListContainers and missing-container ContainerStatus. Preserve generic fixture behavior and report transport refusal separately from expected CRI NotFound.

## Non-Goals

Production transport selection, source-memory authority, authentic runtime evidence, Pod creation, host runtime access, protected installation and F9 acceptance.

## Constraints

Use pinned verified crictl, current-user containerd with fresh private root/state/socket/config, bounded command and cleanup deadlines, no privilege changes, and measured serial resource use. Parent-approved spike scope supplies the design boundaries. Existing peer PID/UID and pidfd checks remain mandatory. No public source push is authorized.

## Capabilities

### New Capabilities

- `cri-relay-feasibility`: explicit disposable-runtime protocol probe.

### Modified Capabilities

None.

## Domain Terms

None; existing CRI and relay terms retain their meaning.

## Decisions Recorded

None; this remains a throwaway feasibility harness.

## Impact

Only tools/tool-devsync/feasibility/source-memory-relay and this change's evidence. No production integration or dependency installation.

## Connected-descriptor amendment (2026-10-17)

The parent authorized a bounded follow-up after architectural review rejected the
paired byte relay's unresolved late-control-frame drain semantics. Explore an
already-connected descriptor with exact fixture PID/UID and a retained pidfd,
without adding a pathname fallback or modifying the strict native refusal.

The installed toolchain supports only synthetic stdlib Python controls and a Bun
inherited-descriptor incompatibility reproduction. These are throwaway observations,
not an implementation of CRI, HTTP/2 completion or a maintained gRPC client. The
original pinned crictl requirement continues to govern the original CRI probe;
this separate synthetic descriptor probe does not invoke crictl or containerd.

Selecting a maintained client with an authenticated connected-socket entry point
remains unresolved with the protected authority owner. No new toolchain or
production dependency is authorized by this amendment. Fixed Version, empty
ListContainers and absent ContainerStatus acceptance require that later selection,
real disposable daemon evidence and the full bounded transport proofs.
