---
status: accepted
---

# Anonymous paid chat is bound to the browser draft claim

The Build conversation calls a paid model for a visitor who has not signed in, authorized only by the host-only draft claim cookie that already governs the manual brief, under per-conversation, per-source and site-wide spend ceilings. The earlier plan required Google sign-in before the first paid call, which removed most abuse risk but put a login wall in front of the conversion conversation Dany wants; a sign-in wall is the alternative kept in reserve and switching back is a configuration and copy change, not a schema change (superseded by the amendment below). Consequences: the maximum daily loss is the site-wide ceiling ($10) plus the key's own monthly limit; client addresses are hashed with a daily salt for the per-source ceiling; chat content lives in draft-owned tables rather than account-owned ones, so retention and purge follow the draft's lineage. Accepted on 2026-10-11 as a batch 10 assumption (veto V1); Dany may overturn it on the veto sheet.

## 2026-10-11 amendment: the account chat path is retired

The sign-in wall was kept "in reserve" as a parallel account-owned chat (`/chat*`, `/concept*`,
prospect OIDC and demo sign-in) that no deployment could reach, because no OIDC client was ever
provisioned. Every guardrail since then had to be built twice, and the unreachable path carries a
known lock-up on unsettled usage. We decided that the funnel has exactly one conversation design,
the claim-bound anonymous one; the account path, prospect sign-in and the Build sign-in section are
removed from the code, and a configured `OIDC_*` setting stops the API at startup so nobody can
believe sign-in exists. The tables stay (additive migrations); `provider_call` is read for the
site-day sum until it is confirmed empty on the deployed database, then dropped from the sum.

## Considered options

- **Keep the account path dormant:** no deletion, but two designs to guard, test and reason
  about, and a privacy notice that would have to name Google the day someone configures it.
- **Make sign-in optional for continuity only:** the shipped state; same double cost, and a
  returning visitor is already served by the 24-hour claim and the proposal email.
- **Retire the account path (selected):** one API, one pump, one allowance, one accounting rule;
  reversible by reverting one PR.

## Consequences

Returning prospects have no account; continuity beyond the claim's life is the proposal request a
person answers by email. A future prospect account is a new change with its own privacy wording,
not a revival of this code. The unknown-usage rule is ceiling settlement everywhere (no hold, no
reconciliation); recorded spend may over-count and the operator overview shows by how much.
Concept preview (M3) has no host until it is re-planned on the anonymous conversation.
