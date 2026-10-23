## Verification record

Drafted 2026-10-23 as an OpenSpec proposal; slice 1 is built on branch
`feat/wbs-claim-leases-1`. L1 to L15 in design.md are assumed until Dany reads them. Sources
read on 2026-10-23 on `main` at `52a41bfc4`: issue #667, issue #668 and PR #670,
`wbs-team-claims` (D1 to D8), `wbs-organization-limits` (L5, L9, L10), `claim.ts` (domain,
sqlite and memory), `claims.ts`, `work-item.resource.ts` (`claim`, `release`, `record`, the
`add_claims` and `remove_claims` replays), `plan-commands.feature.ts`, `retention-timer.ts`,
`machine-credential-administration.ts`, `consent-credential.ts`, `authentication.feature.ts`
(`machinePrincipalOf`), `principal.ts` (`credentialPinOf`), `startable.ts`, `person-work.ts`,
`claim-limit-race.db.test.ts`.

Term collision checked in `CONTEXT.md`: **Claim** lists _lease_ among its avoided names (a
claim is not itself a lease); the new term is **Claim lease**, the instant a claim must be
renewed by, distinct from **Upstream refresh lease**.

`openspec validate --all --json`: run before each push, result in the PR.

## What must be observed before slice 1 is called done

- A human claim survives every sweep; an agent claim is released at exactly its expiry and not
  one millisecond before.
- A renewal racing a sweep: the claim is held iff the renewal's instant is before the expiry.
- A release racing a sweep: no claim is released twice and nothing throws.
- Revoke the last credential: the claims go on the next tick; revoke one of two: nothing goes.
- After a reap the claim cap's count and the leaf's occupancy drop, and a refused agent's
  retry is applied.
- A heartbeat within the minute does not wait for a held write turn.
