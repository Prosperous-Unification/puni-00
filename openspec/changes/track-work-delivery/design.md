## Context

Existing WBS externalRefs already persist links and enforce organization/project access. The links modal is the natural entry point. Dash's GitHub reader observes activation candidates against authority bindings; its accounting attributes accepted outcomes and harness usage, not CI attempts. Neither is a generic delivery reader. Navigator progress receipts are operator assertions and must not acquire new acceptance semantics from this view.

## Goals / Non-Goals

Deliver a read-only, on-demand work-item view for public GitHub change requests, using reusable provider-neutral records and calculations. Preserve explicit unknown/partial states and source provenance. Do not alter work-item progress, CI selection or merge enforcement, add credentials, background services, persistence, or claim deployment acceptance.

## Decisions

### Shared model and adapter boundary

Create `libs/shared/domain/delivery` (`@shared/delivery`, isomorphic domain library) for versioned schemas, inferred types, reader interfaces and pure timing calculations. Records use opaque source-scoped identities and revision strings, never GitHub numeric keys, workflow filenames, SHA lengths, runner brands or provider status enums. Model change request, observed checks, delivery runs, attempts and executions separately. Preserve source provider, source identity, source URL, native state and observation timestamp. A synthetic second provider fixture must traverse the same validator and calculator unchanged.

An execution distinguishes performed work from carried outcomes. Carried outcomes are visible but never add another execution duration. Each attempt carries its own start basis; missing enqueue timestamps remain explicitly unknown. Metrics label summed execution duration separately from elapsed wall time; concurrent jobs can sum to more than wall time. Unknown timing is not zero. Incomplete inventories make totals partial. Checks for an older revision cannot become the current revision's checks. Empty checks do not imply success or merge eligibility.

Create `libs/shared/adapters/delivery-github` (`@shared/delivery-github`) for URL detection and bounded read-only GitHub REST translation. Keep API schemas, status mappings, attempt ordinals, check-suite associations and runner fields inside this adapter. Accept only canonical public github.com pull URLs, construct fixed api.github.com GET paths, reject redirects, and use a bounded timeout/body/request/page budget. Unknown link kinds are unsupported without network traffic. Anonymous public access is the initial runtime configuration; inaccessible/rate-limited/unavailable responses are explicit modeled readings, malformed provider records cannot become successful observations. Do not forward tokens or user-selected origins.

Read the PR, checks for its observed head, and associated Actions runs/attempts/jobs. Read attempt-specific metadata and jobs to distinguish partial rerun carryovers by their original timestamps. Preserve all observed attempts, classify carried jobs conservatively, and mark uncertain execution attribution incomplete. Bound scans and record truncation. Re-read PR identity/head before returning to detect races; do not publish mismatched readings as current. Check observations cover provider checks, not repository merge policy or legacy commit statuses; disclose that coverage. Actual queue eligibility is unavailable where the provider does not expose it. Report attempt-to-job-start waiting with that name and basis, never runner queue time.

### Authorized route

Declare `GET /api/projects/:id/work-items/:workItemId/refs/:refId/delivery` in WBS contracts and its endpoint inventory. Resolve organization access, project/work-item membership and the stored ref before invoking a `DeliveryReader`. The caller cannot submit an arbitrary fetch URL. Return an observation envelope or an explicit unsupported/unavailable reading. Foreign and missing work items/refs answer alike and make zero provider reads. Composition supplies the GitHub adapter, with an injected reader for tests. No database schema or command changes.

### UI and freshness

Extend the existing links modal with an explicitly triggered delivery panel for a saved reference. Use the typed HTTP client and existing scoped request context. Show loading, failed fetch, unsupported, unavailable, empty checks, partial coverage and observed timestamp. A reading older than five minutes is visibly stale; refreshing replaces it, and a failed refresh must not leave an old reading labeled current. Cancel or discard reads after reference/work-item/organization changes. Show change state, revision, merge commit, checks, attempts and labeled timing. Never equate merged with done, deployed or accepted. Link edits retain existing behavior.

## Risks / Trade-offs

Public unauthenticated API limits make occasional unavailable readings expected; explicit refresh and no automatic polling bound traffic. Exact queue eligibility and some external-provider timing are absent; preserve gaps. Provider APIs are not atomic, so pin revision and expose observation time. The initial runtime holds no durable metric history; retained attempt history comes from provider reads. A shared library adds Nx targets, but no new required workflow or repeated suite. Source docs: https://docs.github.com/en/rest/actions/workflow-runs, https://docs.github.com/en/rest/actions/workflow-jobs, https://docs.github.com/en/rest/checks/runs.

## Migration Plan

Additive libraries, endpoint and UI only. Existing external references remain the linking mechanism. No migration, credential changes or deployment in this change. Validate a real Puni PR through the adapter and authorized local WBS composition, then prepare a PR for separate merge authorization.

## Open Questions

None blocking this slice. Private-provider credentials, durable ingestion and additional adapters require later scoped changes.
