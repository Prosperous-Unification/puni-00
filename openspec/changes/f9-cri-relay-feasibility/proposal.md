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
