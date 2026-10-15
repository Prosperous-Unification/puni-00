## Why

The production backend is Debian 13 with dash `/bin/sh` and no BusyBox. Namespace admission requires BusyBox metadata tools and `read -t`; its implicit shell launch fails before deployment can prove cleanup.

## What Changes

Ship a static BusyBox from an immutable Docker Official Image digest in the backend runtime and invoke supervisor and scanner with explicit BusyBox sh. Preserve audit receipts, initialized sessions, deadlines, and reaping. Provide attended outgoing-container preparation using the exact retained old app image and a verified read-only binary bind.

## Capabilities

### New Capabilities

- `container-audit`: Explicit backend audit executable compatibility.

## Impact

Backend image construction, namespace audit invocation, and production preparation runbook. No live container changes or deployment.
