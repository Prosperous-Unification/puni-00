## Context

PlanReferenceRecord seals exportDigest as well as the task digest. PlanRef alone cannot distinguish every exported planning revision. ADR 0027 describes accepted planning authority; this local command does not implement that broker. ADR 0052 distinguishes digest integrity from authentication.

## Goals / Non-Goals

Bind new progress receipts to the complete producer reference and require an independently supplied accepted reference before proposing commands. Retain historical decoding and conversion. Authentication, live WBS freshness, application, and accepted-reference discovery remain outside this command.

## Decisions

Use an additive schema 2 union member with required referenceDigest. Keep schema 1 strict and unchanged. Dash exposes record-progress-v2 explicitly. Navigator admit-progress has five required file flags: --receipt, --plan-reference, --tasks, --accepted-reference, --output. Strict decoding precedes checks. Require receipt.referenceDigest = producer.referenceDigest = accepted.referenceDigest, then reuse shared consistency and command conversion. Shared consistency conditionally enforces the schema 2 receipt-to-producer digest binding for every consumer, including validate-progress-receipt and receipt-to-commands; schema 1 retains its historical PlanRef-only consistency semantics. Exclusive publication follows all checks.

## Risks / Trade-offs

A caller can select an obsolete or forged accepted reference. Digests detect mismatched supplied records, not authenticity or current WBS authority. Existing conversion remains a proposal mechanism for legacy receipts and does not claim admission.
