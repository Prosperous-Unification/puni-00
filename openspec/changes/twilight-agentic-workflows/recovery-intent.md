# Resolve uncertain authority and claim requests

## Problem

A coordinator can crash before sending a staged request or after WBS accepted it but before local acknowledgement. Ordinary duplicate delivery deliberately performs lookup only. A missing receipt does not exclude a delayed request, so the current pending slot cannot safely be cleared and replacement work cannot be inferred safe.

## Outcome

Retain a recovery journal with verified response values and original evidence. Stage and record a dominating receiver fence, then capture an ordered lookup of the original command. Publish its acceptance or fenced nonacceptance, generation barrier and claim recovery hold atomically through four semantic store operations. Complete reads expose every recovery witness and preserve exact historical acknowledgements.

## Non-goals

This first packet implements authority and claim logical recovery. Write/outbox delivery and recovery, physical worker lookup/effect/quiescence, replacement, operator transitions, business-attempt/budget lifecycle, additional adapters, a second durable provider and S7a remain required subsequent work. This packet provides no production deployment or architectural main-merge authorization.

## Constraints

Preserve and explicitly upgrade genuine populated format3 stores; never migrate during ordinary open. Append a named additive migration with guarded down, preserving every earlier migration byte. Permit only the documented legacy artifact-retention and monotone refusal-clock exceptions; prove already-open and queued old writers cannot change execution, ownership or history after upgrade. Keep all inherited guards installed, retain capacity throughout uncertainty, and require actual production-path negatives for each new safety check. Receiver/network and artifact validation remain outside synchronous provider transactions.

Approved for implementation, tests and review on 2026-10-28. Architectural merge remains held. Decision: [ADR 0064](../../../docs/adr/0064-uncertain-runtime-requests-use-journaled-recovery.md).
