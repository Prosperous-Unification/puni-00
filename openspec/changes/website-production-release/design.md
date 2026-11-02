## Context

The [launch plan](../../../docs/website/site-revamp-plan.md) already requires backend-first rollout, verified snapshots, rollback and actual request handoff. Source inspection on 2026-10-25 found only `website-dev` in public platform policy and private fleet. Private release tooling hardcodes development origins/paths. Its current rollback removes the newest receipt and selects the preceding receipt; additive migrations alone do not make that API compatible with versioned scoping.

Public source lives in this repository. The licensed Astro site and build/pin tools live in `private/puni-pr-00`; workload manifests and policy checks live in `private/puni-fleet`. The private deployment contract and `website-on-k3s` change govern their existing behavior. This plan adds production scope without transferring private source into the public tree.

## Goals / Non-Goals

**Goals:** concrete isolated production artifacts/target, a tested compatible rollback, and an evidence record that makes the remaining activation work reviewable.

**Non-Goals:** public cutover during preparation; platform replacement; a generic environment framework; provider-cap increases; prospect-data migration from development; automatic erasure activation; new About/blog content.

## Decisions

### Two explicit environments

Extend the existing release tool with two validated environment descriptors. Each owns its site/app origins, fleet root, namespace, receipt location, secret-provisioning destination and build-time analytics selection. Preserve the existing development command behavior where omission historically means development, but always write an explicit environment on newly produced artifacts. Unknown or mismatched values throw. A historical absent field is recognized only in the historical development receipt path, never as a production default.

Production uses `website-prod`; the public platform owns restricted admission/default-deny in `infra/platform/policy`, with `tools/tool-fleet` enforcing it. Fleet manifests own isolated workload storage/allow rules, production host ingress, secrets declarations, backup prefix and activation. Keep the production Flux unit suspended until the separate activation action. Use production backup/journal prefixes `sqlite/website-prod/` and `retention-journal/website-prod/`; the existing runtime manifests expose these as explicit nonsecret environment values, so fleet policy can validate isolation. Never reuse a development database or automatically copy development credential values. Secret provisioning remains an explicit environment operation, with no plaintext in source or output.

The selected environment belongs in the configuration checksum and release identity. Development and production artifacts have distinct output locations even when built from the same source revisions. Private snapshot checks must include the new analytics dependency while retaining historical receipt compatibility. Existing licensed media/font and static build boundaries remain intact.

### Protocol capability and rollback

The public API build emits `conversion-scoping/1` in its existing capabilities file. New private pin/rollback and fleet policy require that capability for active website releases. This is a minimum supported backend protocol, not a toggle coupled to inference, analytics or the current landing version. There is no mutable activation marker that ordinary rollback can clear to bypass it. Historical receipts remain inspectable but cannot become active through the supported updated pin/rollback tools without the capability.

Prepare a compatibility baseline first: the prior landing/site behavior with the new committed canonical app/API and dependency snapshot. The baseline keeps analytics disabled until the corresponding accurate privacy notice and consent UI are included. The following launch release adds the new landing/services/privacy integration. Both receipts therefore use a scoping-capable backend, and rolling the launch release back preserves drafts created by its newer landing. The baseline must be built/rehearsed before the launch candidate is declared ready. The first capability-enforcing fleet commit must pin a compatible receipt; do not merge enforcement alone while retaining an incompatible active receipt.

Rehearse actual retained legacy/versioned requests on disposable storage with the built baseline and candidate. Include raw followup retry, structured replay, failed reply accounting, exact final references, pending proposal recovery and manual submission while inference is disabled. Existing migration rollback tests still prove SQL shape; they do not substitute for this runtime exercise. Never run `down.sql` or restore an older database as part of ordinary code rollback.

### Explicit pin order

The accepted baseline source starts with e969 and the candidate with a23. Their same-date IDs therefore sort in the opposite order to the intended rollout. Existing private rollback and fleet newest-receipt selection sort those identifiers. Keep the existing build IDs/tags; new committed receipts gain environment-scoped positive safe-integer `pinOrder` assigned at pin time. The next value is one above the greatest retained ordered pin; it is not an append-only audit sequence across deleted Git history. Reject duplicate/invalid modern order before writes. Historical recognized four-tree development records retain their old identifier order and sort before ordered modern records; absence on a modern record is an error. Published build inputs acquire order when pinned, not during artifact construction.

Private pin/rollback and fleet selection must agree. Preserve source/environment/capability validation and ordinary code rollback's no-database-restore rule. The private release ADR records the trade-off against changing identifier format or inferring order from Git timestamps. No fabricated dates, source-hash mining or protocol-floor waiver belongs to preparation.

### Evidence and activation boundary

Public code must stabilize before the exact-SHA host gate; platform namespace/capability changes therefore precede the final gate and private snapshot. Private build and fleet checks use their own Bun/Nx targets. Build receipts name public/private revisions, all canonical tree identities, environment and artifact/configuration hashes. Fleet receipts additionally pin image digests.

Local fixtures prove contracts and isolation. Live checks require authorized operator access: TLS/origin matrix, release identity, production secret provisioning, capped provider identity, current backup/restore and request arrival. The available `puni1@h4claw` account cannot run sudo/kubectl, so prepare exact nonsecret operator commands and record that limitation. Do not probe undocumented credentials or substitute the historical h2 runtime key check for the current deployment identity.

## Risks / Trade-offs

Preparing a compatible baseline adds one release artifact but avoids a complex mixed-service rollback format. It retains the prior landing only for recovery, while the canonical app/API stay protocol-compatible. Separate environment descriptors and receipts add validation paths; they prevent production from silently inheriting development hosts, analytics or storage. Account/cluster evidence can remain unavailable after local code is complete; report that explicitly rather than weakening activation criteria.

## Migration Plan

1. Add public namespace validation and backend capability with observed negative proofs.
2. Finish the public funnel/analytics/evaluation, then gate a stable public revision.
3. Update private dependency closure and environment-aware build/pin tools; prepare compatibility baseline before replacing its landing behavior.
4. Add the isolated production fleet target and capability policy, with suspended activation and verified release receipts; rehearse both environments on disposable storage.
5. Present the concrete candidate, evidence and remaining authorized operator actions. Public cutover is a separate decision.

## Open Questions

No implementation design question blocks preparation. Production GA4 ID/settings, deployment credentials and fresh live backup/restore/provider evidence remain external activation inputs, tracked in the existing analytics and launch records. About/new blog content is excluded from technical readiness.
