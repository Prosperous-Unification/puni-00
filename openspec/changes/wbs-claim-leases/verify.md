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

## Slice 1 as built (`feat/wbs-claim-leases-1`, 2026-10-23)

What landed: `@wbs/domain` `claim-lease.ts` (`CLAIM_LEASE_MS`, `leaseOf`, `isLeaseInForce`,
`renewalAt`, `LeaseStanding`); migration `20261023100000_add_claim_lease` (two nullable
columns, a partial index, an unguarded `down.sql`); `ClaimStore` lease writes on `add`,
`leaseExpiresAt` on stamped reads, `renewLeases` (read first, turn only when due),
`expiredLeasesOf`, `projectsWithExpiredLeases` on SQLite, the memory twin and conformance;
`CommandJournalStore.appendEvent` (history only); the claim path leases a pinned self-claim
and journals `leased`; a replay re-leases; renewal at the end of every committed batch by a
pinned caller; `WorkItemService.releaseExpiredLeases` and `PlanCommandRunner.releaseExpiredLeases`
(one unit of work, `NO_ADMISSION`); `ClaimLeaseSweep` (30 s, 50 projects a tick, coalesced),
built in `compose.ts` and started and stopped by `bootBe01`; revocation and MCP consent end
call `endLeasesOfUncredentialed`; `POST /api/claims/renew` (`not_pinned`); the admin revoke
route asks the sweep for a tick; `leaseExpiresAt` on the startable and person-work reads; the
MCP tool `postApiClaimsRenew` by derivation.

No new environment variable (L2): nothing to seed on dev or in any spawn fixture.

### R5 proofs, each fault injected and the named test watched failing, then restored

| Guard                                       | Fault                                    | Observed                                                                                       |
| ------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `isLeaseInForce` boundary                   | `<=` for `<`                             | `is expired at exactly its expiry` (claim-lease.test.ts) 5 pass, 1 fail                        |
| `leaseOf` claimant comparison               | any pin leases                           | `leases only a pin naming the claimant itself` 5 pass, 1 fail                                  |
| claim path leases (`leaseOf` call)          | answer null                              | claim-lease.db.test.ts 1 pass, 9 fail                                                          |
| batch renewal                               | skipped                                  | `renews an agent's lease on every committed write…` 9 pass, 1 fail                             |
| `renewLeases` read before the turn          | always enter the turn                    | `answers a heartbeat within the minute while a batch holds the write turn` 9 pass, 1 fail      |
| `renewLeases` in-force predicate            | dropped                                  | model test counterexample: claim, advance 900,000, heartbeat; 0 pass, 1 fail                   |
| `expiredLeasesOf` expiry `lte`              | `lt`                                     | model test counterexample: claim, advance 900,000, sweep; 0 pass, 1 fail                       |
| sweep reads expiry inside its turn          | expired set read before queueing (stale) | `a sweep queued behind a release…` threw "expired claim … is not a claim of"; 1 pass, 1 fail   |
| journal `leased` on a claim                 | field left out                           | `refuses the holder’s undo after a reap, and redoes a claim with a fresh lease` 9 pass, 1 fail |
| replay re-lease                             | leases left out                          | same test 9 pass, 1 fail                                                                       |
| `readClaimReplay` `leased` check            | removed                                  | compensating.test.ts 38 pass, 1 fail                                                           |
| reap cascade through delegated claims       | loop skipped                             | `releases the claims delegated under an expired subtree claim` 9 pass, 1 fail                  |
| `endLeasesOfUncredentialed` live check      | removed                                  | `keeps the leases when one of two keys is revoked…` 9 pass, 1 fail                             |
| admin revoke ends leases                    | call removed                             | same test 9 pass, 1 fail                                                                       |
| consent end ends leases                     | call removed                             | `ends the leases when an MCP consent was the last live credential` 9 pass, 1 fail              |
| `appendEvent` history only (SQLite, memory) | a stack row written beside it            | `journal.appendEvent:history-only` certification case, 74 pass, 1 fail each                    |
| memory `renewLeases` in-force test          | dropped                                  | `claims.lease:write-renew-expire` memory certification, 74 pass, 1 fail                        |
| `not_pinned`                                | refusal removed                          | `renews on an agent heartbeat and refuses a session heartbeat not_pinned` 2 pass, 1 fail       |
| revoke asks for a tick                      | `afterRevoke()` removed; app no-op       | `releases a revoked agent’s claims on the tick the revoke asks for` 2 pass, 1 fail each        |
| sweep schedule, coalescing, error report    | no-op `every`; guard off; rethrow        | claim-lease-sweep.test.ts 2/2, 3/1, 3/1 pass/fail                                              |
| boot starts the sweep                       | `start()` removed                        | `starts the claim lease sweep with the process` (boot.db.test.ts) 36 pass, 1 fail              |

### Fresh results

See the PR body for the command outputs of this slice's final head.
