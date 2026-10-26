# Runtime integration with organization limits

## Intent

Current main `33685ec480bc996b6d1909156167367af7279941` implements organization
limits after the runtime receiver/executor integration's pinned main. Reconcile
those already specified behaviors so conditional runtime claims use the same
transactional organization gauge, closed refusal detail and deployment defaults
as ordinary claims, while exact accepted retries retain their original receipt.
Preserve the other session's implementation and every migration identity/hash.

The outcome is one reviewable combined candidate containing main, the receiver,
executor, portable request codec and receipt correspondence. It supplies mounted
SQLite consumer regressions for cap refusal, below-cap acquisition and historical
replay after a cap reduction. Source conflict resolution must preserve both
parents rather than select an entire side.

This is consumer integration, not a new limit policy, configuration fallback,
credential system, provider, migration repair, sender or coordinator. It does not
complete I1/S0/S7a, prove live authentication or authorize merging/deployment.
Existing candidate gates remain anchored to their immutable heads. Recheck main
at source adoption; later movement is explicit acceptance context, never silently
substituted into a running gate.

## Existing contracts

Main's `WorkItemService.claim` checks `claim_limit` last, before writes, through
`OrganizationLimitGauge` in the admitted transaction. A bound claim counts a
distinct work-item/person/run triple. The working-plan getter and module wiring
carry that same capability. It is optional for public/legacy graphs; an activated
scoped acquisition without it throws. The runtime command runner already invokes
the ordinary claim path and commits its binding/receipt only after success.

Main owns all default values, limit rows, gauges, domain policy, operator CLI and
configuration. Tests consume `TEST_ORGANIZATION_DEFAULT_LIMITS`; production must
not gain a fallback. Preserve all current credential pins and permission checks.
The shared refusal registry must retain both parents' runtime and main variants,
including `claim_limit` with `cap`, `current`, command index and command kind.

Accepted exact request replay is a historical read under current authorization;
it adds no claim and does not become a fresh acquisition when the cap changes.
Newly refused commands retain no receipt, binding, mutation journal or claim.

## Migration and evidence boundaries

Runtime remains `20261022121000_add_runtime_commands`. Main's new limits and audit
migrations are `20261022130000_add_organization_limits` and
`20261022130100_widen_organization_audit_organization_limits`. Preserve every SQL
file and paired down file byte-for-byte. Complete fixture catalogs and reverse
oracles include the union in numeric timestamp order. The old draft-identity
refusal fixture reproduces its actual old-parent catalog, excluding _all_ later
main additions, and still proves no implicit ledger/schema/history mutation.

Only genuinely changed safety/composition checks need fresh watched negatives.
Do not gratuitously recertify separately owned limit policy. If the consumed gauge
is temporarily removed at the real graph boundary, record the actual 500 refusal
diagnostic versus expected typed cap reply, not an invented unsafe-acceptance
claim. Any new check needs its own unmasked production-path fault/restoration and
truthful adjacent Proof. Source hashes and final check results are frozen before
the one complete SQLite suite. Broader host/CI acceptance belongs to the final
published combined SHA. No new domain term or hard-to-reverse decision is made.
