## Why

WBS080.25 can convert supplied progress receipts and bind them to a caller-selected accepted reference, but cannot attribute them to an independently authorized producer or establish current planning authority. A recomputable digest does not supply either authority. Introducing signatures before deciding who may assert what would preserve that gap behind a stronger-looking record.

## What Changes

Prepare a design-only authority contract and threat cases for later authenticated progress admission. Separate producer attribution, the truth of execution claims, freshness of accepted planning state, and atomic publication/replay. Record the owner decisions that block implementation and the production-path negatives a later implementation must demonstrate.

## Capabilities

### New Capabilities

- `progress-receipt-authority`: requirements for independently authorized producer attribution and its explicit limits.

### Modified Capabilities

None.

## Non-Goals

No production wire schema, algorithm selection, key creation, issuer enrollment, signing, crypto implementation, accepted-plan broker, WBS application, activation, deployment or certification. Existing schema-1/2 receipt recording, conversion and selected-reference admission retain their documented meaning. This packet does not resolve or republish held roundtrip candidate `40243e58b0fc1f3cfc3bdbf965276bbc63ef6e35`.

## Constraints

This packet is for architecture review, not implementation dispatch. Issuer scope, custody, protected trust-root selection, rotation/revocation, freshness and publisher authority remain owner decisions. Candidate-controlled material must not establish its own authority. WBS080.25 remains in progress. Preserve the tool boundaries and historical contracts; do not infer live acceptance from fixture evidence.

## Domain Terms

None added. Reuse progress receipt, bound progress receipt, selected accepted reference and plan reference from the Twilight glossary.

## Decisions Recorded

None. [ADR0052](../../../docs/adr/0052-dash-runs-activation-checks-and-burokrat-judges-their-receipts.md) records the missing signing trust root; [ADR0027](../../../docs/adr/0027-planning-commits-are-the-transaction-boundary.md) remains proposed planning authority.

## Impact

Design artifacts only. Future consumers include Burokrat contracts/judgment, Dash producers and Navigator admission. No dependencies, implementation or global scenario allocations change.
