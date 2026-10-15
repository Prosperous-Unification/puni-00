## Why

Local fleet lab creation can fail after Docker resources exist, while the current teardown infers ownership from names and labels. A file recording that an attempt ran cannot establish ownership of those resources. We need durable attempt evidence before building recovery around exact creation identities.

## What Changes

Every k3d lab creation reserves an owner-only, exclusive attempt journal bound to its validated lab, UUID and Docker daemon identity before resource creation. Success and failure durably complete that journal. k3d automatic failure rollback is explicitly disabled; resource state remains unknown until manual inspection. Attempt history survives ordinary lab teardown. A separate receipt-consuming lifecycle boundary rejects missing, unreadable, malformed and mismatched journals, and refuses deletion even with a valid journal.

## Non-Goals

Resource ownership receipts, adoption of existing resources, identity-based deletion, k3d cleanup, volume deletion and recovery CLI activation. Existing ordinary teardown semantics are outside this phase.

## Constraints

Offline fixtures only; no live Docker, k3d or Kubernetes operations. Preserve existing lab callers and profiles. Do not claim a journal makes existing name/label teardown safe. Persistence failures must prevent resource creation or propagate visibly, requiring manual inspection of unknown resource state. Bun and scoped Nx checks only; no host gate, push or PR.

## Capabilities

### New Capabilities

- `fleet-creation-journal`: Durable, strictly validated local lab attempt lifecycle without deletion authority.

### Modified Capabilities

None.

## Domain Terms

Creation attempt; creation journal. Definitions are in CONTEXT.md.

## Decisions Recorded

None; no decision meets the ADR threshold.

## Impact

`tools/tool-fleet`: creation journal boundary, k3d up orchestration and offline tests. Local lab documentation gains the manual recovery limitation. Recovery CLI stays disabled.
