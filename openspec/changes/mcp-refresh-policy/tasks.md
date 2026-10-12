## 1. Inert authority boundary

- [x] 1.1 Correct stale enterprise-SSO refresh claim; specify bounded prerequisite and glossary terms without claiming cutover completion.
- [x] 1.2 Classify legacy epoch-0 versus bound/unsupported family authority before shared fresh-token return; refuse absent organization authority on three real paths. Tests: `refuses organization-bound automatic|forced|grant refresh without authority before provider contact`; negative: without guard automatic/forced resolve, grant answers 200; verify zero provider contact, no successor session and unconsumed refresh secret. Test corrupted nonzero-epoch family read on automatic resolution; fault: unconditionally classify as legacy and observe upstream credential returned.

## 2. Trusted binding and policy reader (not implemented)

- [ ] 2.1 Bind consent/code/grant/family/session to stable user/org/issuer-subject/client/scope/epoch and independently trusted openedAt/reauthenticatedAt; preserve unknown. Test substitutions at every stage and session/family disagreement. Fault: omit each binding comparison and observe its production-path refusal fail. Production activation and epoch advance remain separately gated by organization-ownership-and-access 6.4–6.6.
- [ ] 2.2 Add authoritative current-membership/SSO/session-policy reader with denied/unavailable distinction and shared `credentialRuleRefusal` semantics for genuinely trusted delegation lifecycle evidence. Test fresh-token membership loss on all three paths, enforced connection mismatch, unknown times, equality and one-millisecond excess for both bounds. Fault: skip reader or default unknown to now; observe named negatives fail.

## 3. Provider wait and publication (not implemented)

- [ ] 3.1 Recheck current authority after held provider work and rival lease completion; bound convergence and release leases on refusal. Test held provider policy tightening/removal, binding change and reader outage with zero successors/tool calls. Fault: remove post-provider check; observe stale completion publish and named negative fail.
- [ ] 3.2 Preserve replay-before-capacity, scope narrowing, single provider lease and atomic successor consumption; retain be-01 final refusal and signed delegation on forced retry. Tests: scope widening, replay during held provider, concurrent refresh/revocation, final-use membership loss and outage retry. Fault: bypass consuming CAS or forward raw upstream retry token; observe mounted end-to-end negatives fail.

- [ ] 3.3 Before organization-aware activation, revisit the mounted forced-refresh caller contract in `server.ts`: it currently calls `endSession` after any `SessionRefreshRefused`. Distinguish a terminal credential refusal from an authority refusal intended to preserve the family, and retain unavailable outcomes separately. Tests: mounted forced refresh preserves the family and consumes no secret for a nonterminal authority refusal, ends it for a terminal refusal, and retries with signed organization delegation only after current authority admits. Fault: collapse all refusals to `SessionRefreshRefused`; observe the mounted family-preservation negative fail. The inert slice cannot reach this branch with a bound family because request authentication refuses it first.

## 4. Verification

- [ ] 4.1 Run OpenSpec validation and exact committed-SHA h2puni gate; record output and every R5 fault in verify.md. Keep policy slices open until implemented and proved; no merge, deploy or activation in this packet.
