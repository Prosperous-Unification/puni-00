# Portable runtime receipt correspondence

## Intent

A durable sender must distinguish a receipt for its exact retained request from a shape-valid receipt for something else. Publish the receiver's existing acceptance and identity comparisons through WBS contracts, compose them with complete receipt identity/digest matching, and make the receiver consume that shared implementation. Preserve accepted bytes, storage checks, current permission checks and rejection order.

This packet supplies synchronous correspondence over already boundary-validated runtime values. It does not authenticate the server, calculate hashes, retain sender intent, authorize work/spending, change credentials, establish current authority/effect success, migrate stores or implement the coordinator.

## Context

Base `e7c2e9a25e21a01cd3184e607c7659bca3f33354` publishes the exact request codec. Its own host/CI gates remain pending. Current `runtime-authority.ts` owns `matchesScope`, exported `matchesRuntimeClaim` and private `matchesAcceptance`. `verifyRuntimeAcceptance` combines these with strict canonical decoding and the injected Digest. Runtime write admission also consumes `matchesRuntimeClaim`. Repository parsers separately validate stored envelope/receipt identities and installed ledger. Shared HTTP shapes validate response structure, not complete retained-request correspondence.

## Goals / Non-Goals

Goals: one portable set of runtime identity/receipt predicates; real receiver consumption; complete negative cases for metadata and acceptance; preserved existing comparators; truthful watched dependency faults.

Non-goals: new receipt/wire decoder, automatic matching inside the generic HTTP client, transport authenticity, sender persistence/retry, manifest governance, provider wiring, migration/legacy tooling and S0/S7a completion.

## Decisions

Create contracts `runtime-receipt.ts` and export exactly these functions through the existing index:

```ts
matchesRuntimeScope(left: RuntimeScope, right: RuntimeScope): boolean;
matchesRuntimeClaim(left: RuntimeClaim, right: RuntimeClaim): boolean;
matchesRuntimeReceipt(scope: RuntimeScope, operation: RuntimeOperation, requestDigest: string, receipt: RuntimeReceipt): boolean;
```

Move the current scope/claim comparisons and private acceptance predicate once, preserving their non-comment bodies; rename only `matchesScope` to the scoped public name. The receipt predicate requires matching organization/project/person, expected ledger, command ID, independently computed request digest and request-derived acceptance. Use relative type imports only; no application, hashing provider, new alias or contracts self-barrel import.

Preserve current acceptance rules: authority owner and expected generation (null means1, otherwise exact increment); claim authority plus target/parent/complete execution; write authority plus exact claim and ordered applied indexes/kinds/length. A fresh claim ID is receiver-generated. Do not predict it; compare every request-known field. Actor account and scope person are distinct; the request supplies no expected actor. Resulting basis remains a validated server value, not a required increment/change.

The predicates are synchronous and nonmutating, assume existing boundary-validated values, and introduce no fallback/default/async snapshot behavior. Callers must obtain the expected SHA-256 from the exact retained canonical string, validate external shapes once, and establish authenticated transport separately. Unknown/malformed input is outside this typed predicate contract and must not be advertised as validated by a true return.

In the application, retain canonical decode, stored identity/installation, stored digest verification and existing error messages/order. Replace private comparisons with shared imports and preserve the existing `matchesRuntimeClaim` compatibility export for `runtime-write.ts`. Repository/HTTP/auth checks remain in place. No second equality/acceptance implementation remains.

## Alternatives / Risks

A private bridge copy would drift from the receiver. A new complete shared receipt decoder would broaden this packet and duplicate or restructure existing HTTP/storage boundaries; defer it until trusted sender-artifact decoding is designed. Reusable scope/claim exports avoid copying the receiver's existing identity logic; the cost is a wider contracts barrel. This internal extraction is reversible, so no new ADR is warranted.

New metadata comparisons need isolated public-production-predicate faults. Existing unchanged predicates retain their historical proof scope. The changed shared receiver call and write-claim dependency each need actual receiver/SQLite negatives, not a helper or fake receiver implementing the rule. Preserve absence of authority/authentication claims even when all values match.

## Migration Plan

No SQL, migration identity, stored bytes or wire response change. Historical acceptance remains historical and does not refresh current grants. Existing caller imports remain valid.

## Open Questions

None blocks this bounded comparison extraction. Durable scope history, pending ambiguity/fenced absence, artifact decoding, preparation/full locator/claim/turn ordering and governance remain later design work.
