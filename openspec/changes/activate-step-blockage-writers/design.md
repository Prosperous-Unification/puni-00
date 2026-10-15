## Context

The admission migration starts DISABLED and three SQLite triggers guard every fact mutation. Boot validates the migration, singleton and exact trigger definitions. Existing Compose maintenance fences writers before migration and retains stop, maintenance, migration and exposure intents on interruption.

## Goals / Non-Goals

**Goals:** Preserve that boundary, add one atomic transition and retain the exact attempted identity across uncertain completion.

**Non-Goals:** No activation from boot, HTTP, forwarding, ordinary deploy, or this implementation session.

## Decisions

The image-local boundary accepts a strict version-1 receipt containing activationId, immutable candidateImage and rollbackImage, canonical databaseIdentity, and activatedAt milliseconds. The host supplies these fields after its independent fenced inventory and capability checks. They are observations, not proofs created by this CLI. Canonical JSON is persisted with the marker transition inside an IMMEDIATE transaction. Inspect uses a read-only existing-file connection. Activate uses a noncreating writable connection. Identical retries are idempotent; conflicts and malformed stored authority throw. No deactivation command exists.

The additive receipt table has an id=1 singleton key and valid JSON constraint. Inspect validates its exact `sqlite_master` table definition, normalizing whitespace, before accepting any rows or an empty DISABLED state. A recorded migration alone cannot establish that these constraints still exist; absent, altered and view-substituted definitions refuse. Disabled state has no receipt. Enabled state with no receipt is a pre-receipt legacy state and cannot be attributed to an activation attempt. Receipt migration down refuses enabled state or retained receipts before changing schema/ledger.

Host activation is a later explicit --activate-step-blockage operation under the existing barrier. It writes durable activation intent before image-local execution and requires exact readback before application exposure. Uncertainty retains every barrier. The new step_blockage_activation_v1 compatibility obligation includes enabled databases with zero facts. Both candidate and rollback must support it. A preserve-only capable deployment precedes attended activation. Kubernetes gains compatibility admission but retains its first-start DISABLED requirement.

## Risks / Trade-offs

The image-local command cannot establish host quiescence or immutable image identity itself. It must remain behind reviewed host coordination; manual invocation grants no deployment authority. Legacy ENABLED markers without receipts must refuse attribution and require attended recovery.

## Migration Plan

Apply the receipt migration while DISABLED during the preserve-only release. Later activate only after independently proving a capable rollback release. Never remove receipt authority or disable admission to admit an older writer.

## Open Questions

None for the local receipt boundary. Host implementation remains tracked in tasks.md.

## Preserve-only admission

The existing image-local replay capability CLI explicitly advertises `step_blockage_activation_v1`; this deployment capability does not change the core journal command vocabulary. Both transport inventories embed the same coordinator-owned read-only SQLite inspector, independent of image application decoding. ENABLED with a validated exact receipt contributes one activation obligation regardless of fact and journal counts. Kubernetes seals that obligation with both image observations in its existing admission receipt. The existing Compose recovery proof reads each exact digest's CLI independently before admitting enabled authority.

A coherent pre-marker predecessor is classified only after reading a physical migration ledger and proving neither activation migration is recorded and no marker/receipt schema object or admission trigger remains. Partial authority, malformed/unreadable ledger, invalid singleton/trigger/receipt authority and ENABLED without an exact receipt refuse. A valid marker with DISABLED and no receipt migration/table remains accepted during the preserve-only rollout. Runtime boot, receipt inspection and Kubernetes first-start retain their strict existing requirements.

Ordinary Compose admission captures the actual outgoing container's pinned image reference and runtime image ID, verifies the reference resolves to that ID, and retains the container/image association in the existing writer intent. Post-stop readback must match before candidate/rollback capability admission. A missing or changed association refuses before maintenance and exposure. A genuine first install carries null predecessor explicitly; both initial inventory and admission must observe no managed backend writer, the candidate must advertise the activation capability, and ENABLED authority refuses without rollback. Pre-marker/DISABLED authority remains valid for that first installation.
