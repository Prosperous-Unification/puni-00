## Why

WBS 030.6 remains blocked because trusted activation requires external review evidence,
artifact publication and repository configuration that no installed automation owns.
The user requires this work to proceed automatically without per-PR operator steps.

## What Changes

- A ready PR or changed candidate automatically receives independent review, checks, an
  immutable toolkit activation and an exact-candidate admission decision.
- Candidate-addressed selection replaces the shared activation-variable slot after a
  serialized bootstrap transition.
- Successful protected admission enables automatic merging; the actual merged SHA receives
  its own certification before downstream admission.
- Durable recovery resumes interrupted work, reports terminal failures and reconciles WBS
  030.6 only against observed end-to-end evidence.

## Non-Goals

Changing product behavior, weakening checks, fabricating review provenance, automatically
approving findings, publishing the npm package, or resolving unobserved WBS blockers.
This packet does not activate the system or provision external credentials.

## Constraints

One-time bootstrap requires an independently controlled audit identity and journal provider,
publisher/storage authority and administrative access to install protected configuration.
These capabilities cannot be inferred from variable names or a local cooperative review.
After bootstrap there are no per-PR human review-record, release, variable, rerun or merge
steps. Every approval binds exact repository, head, base and trust identities; new identities
require fresh applicable evidence. Required workflow protection stays enforced. Unknown
state fails closed, and every new safety check requires an observed production-path negative.

## Capabilities

### New Capabilities

- `automatic-trusted-activation`: Independent automatic review, activation publication,
  candidate admission, merge certification and recovery.

### Modified Capabilities

None. Existing activation role verification and publication contracts remain applicable.

## Domain Terms

Activation controller; existing Toolkit activation, Toolkit release and Review attestation.

## Decisions Recorded

[ADR 0037](../../../docs/adr/0037-activation-authority-is-independent-of-the-candidate.md).

## Impact

Twilight Burokrat review/admission and activation adapters, trusted CI and host provisioning,
external controller deployment, activation runbook, historical operator-task reconciliation
and the live WBS 030.6 evidence.
