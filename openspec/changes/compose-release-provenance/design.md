## Context

The [production audit](../../../docs/findings/production-provenance-2026-11-11/report.md) proves routed image identity but leaves source/build/check acceptance open. Compose currently trusts release.json's source claim. Kubernetes descriptor admission already verifies OCI bytes and application labels, while the shared GitHub adapter already owns bounded anonymous GET transport.

## Goals / Non-Goals

Integrate a real refusal boundary into the supported Compose CLI. Keep policy concepts independent of providers, execution targets and runners. Preserve existing deployment machinery and avoid rerunning tests during deployment. This does not admit the unknown old production images or activate dormant lifecycle tooling.

## Decisions

- `provenance.ts` owns typed source/pipeline/check acceptance and selected-image admission. It has no GitHub fields, branch constants, runner identities or target-host assumptions. Mainline/check names are supplied policy, not intrinsic model fields.
- `provenance-github.ts` detects supported GitHub origins, uses the existing anonymous GET transport and validates REST records at its boundary. The initial policy is the existing ci workflow's push to main with passing gate/pixels. It selects the latest applicable execution, reads its current attempt and complete bounded all-attempt job listing, selects each required check's latest applicable attempt with its original identity, then rereads execution and latest selection; changes/incomplete listings refuse. No cached earlier green or candidate-supplied JSON authorizes deployment. A same-execution/source passing check can be explicitly carried across a partial retry without forcing redundant tests; a newer failed check supersedes it.
- `provenance-images.ts` reuses the existing digest-verifying registry reader. Optional existing credential pairs require explicit REGISTRY binding to the reader's effective origin (scheme, host and port), refuse ambiguous/incomplete credential configuration and never follow registry redirects. Public anonymous registries remain supported. No credentials are forwarded from provider access.
- The plan captures selected release entries rather than rereading a mutable release file during execution. Default release parsing validates the external shape. An execution-time pure release-claim check binds repository role, full source SHA, tag and digest.
- Main keeps installed bundle validation first, then provenance acceptance, then existing remote preflight and the single all-tier swap. Successful output reports nonsecret source/execution/attempt and image/config identities. Advisory dry-run explicitly remains unverified.
- The existing anonymous GitHub transport is re-exported through its module API; no new generic HTTP client, authentication store or provider framework is introduced.

## Risks / Trade-offs

Public API rate limits and unsupported origins now refuse execution rather than silently accepting unknown evidence. New verification is read-only and bounded (existing GitHub 30s/32GET/8MiB budget; one 60s selected-image budget), not a new CI queue. Refusal can leave an earlier image running, as the existing deploy safety contract requires. A matching build label is an attributable claim, not a reproducible-build or signing guarantee.

## Migration Plan

No schema migration. Operators use a release built from an accepted exact source and the matching installed bundles. Credentialed image reads reuse PUNI_REGISTRY_AUTH or REGISTRY_USER/REGISTRY_PASS with an explicit REGISTRY authority. Main publishes the tool change; a live application rollout remains dependent on the accepted release, installed executor, env/migration/solver and recovery prerequisites.

## Open Questions

The user is clarifying whether release also includes an application production rollout; implementation, push and merge of this guard are authorized either way.
