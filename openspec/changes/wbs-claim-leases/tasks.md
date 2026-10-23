## 0. Dany reads L1 to L15

- [ ] 0.1 Dany confirms or amends design.md L1 to L15, in particular L1 (which claims are
      leased), L2 (one constant length, no env), L8 (revocation ends leases, the sweep
      releases) and L10 (a reap is history only, never undoable). Slice 1 is built on the
      assumptions; an amendment lands as a follow-up slice.

## 1. WBS core (slice 1, `feat/wbs-claim-leases-1`)

- [ ] 1.1 Red: `claim-lease.test.ts` in `@wbs/domain`: `leaseOf` answers T + 15 min only for a
      pin naming the claimant; `isLeaseInForce` is false at exactly the expiry; renewal is due
      only below `now + 15 min − 60 s`, with a property over instants. Green: `claim-lease.ts`.
      R5 fault: `<=` for `<` at the boundary; watched.
- [ ] 1.2 Migration `add_claim_lease` (two nullable columns, index) with `down.sql` — Red: a
      store-sqlite migration test forward, back, and a claim written by an outgoing release
      (no lease columns named) reading as leaseless. R5 fault: drop the column from the
      forward migration; the store test fails.
- [ ] 1.3 `ClaimStore` gains lease writes on `add`, `leaseExpiresAt` on stamped reads,
      `renewLeases`, `expiredLeasesOf`, `projectsWithExpiredLeases`; `CommandJournalStore`
      gains `appendEvent`; SQLite, the memory twin and conformance cases
      `claims.lease:write-renew-expire` and `journal.appendEvent:history-only`. R5 faults:
      renewal touching an expired lease; an expiry read with `<`; `appendEvent` writing a
      stack row; each watched in its conformance case on both stores.
- [ ] 1.4 Claim path: a leased claim on a pinned self-claim, none otherwise; the journal's
      `add_claims` names `leased`, a replay re-leases them (L11). R5 faults: lease every
      claim; replay without a lease; watched.
- [ ] 1.5 Renewal: in a committed batch by a pinned caller, and `POST /api/claims/renew`
      (contract, route, OpenAPI, MCP tool) with read-first. R5 faults: renewal skipped in the
      batch; the route entering the turn unconditionally (a held-turn test times out);
      `not_pinned` dropped; watched.
- [ ] 1.6 Revocation ends leases when no other credential is live (admin and consent revoke),
      and the admin revoke requests a sweep tick. R5 faults: end leases unconditionally
      (revoke-one-of-two fails); skip the end (revoke-last fails); watched.
- [ ] 1.7 Release: `WorkItemService.releaseExpiredLeases`, the runner's unit of work, history
      event with reason, cascade, announce; `ClaimLeaseSweep` with injected clock and
      intervals, bounded, coalesced, started and stopped by boot. R5 faults: no re-read inside
      the turn (the renew race releases a renewed claim); bound ignored; boot never starting
      it; watched.
- [ ] 1.8 Model-based race test (store-sqlite): random claim, renew, release, revoke, clock
      advance and sweep acts, with races of sweep against renew and against release; after
      every step a claim is held iff it is leaseless or its last renewal before expiry
      happened, and occupancy and the bound-claim count match the model. Focused swarm-style
      test: two agents, one exclusive unit, cap 1; the first's lease expires, the second's
      retry is admitted.
- [ ] 1.9 Reads: `leaseExpiresAt` on startable and person work; contracts and the generated
      document.
- [ ] 1.10 `CONTEXT.md` term **Claim lease**; module indexes; `verify.md` with commands,
      results and proofs.

## 2. fe-01 display (slice 2)

- [ ] 2.1 The claim chip shows a leased claim's remaining time and an expired one as
      "releasing"; the history row reads "released (lease expired)".
