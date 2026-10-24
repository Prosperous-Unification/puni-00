## 0. Dany reads L1 to L16

- [ ] 0.1 Dany confirms or amends design.md L1 to L16, in particular L1 (which claims are
      leased), L2 (one constant length, no env), L8 (revocation ends leases, the sweep
      releases) and L10 (a reap is history only, never undoable). Slice 1 is built on the
      assumptions; an amendment lands as a follow-up slice.

## 1. WBS core (slice 1, `feat/wbs-claim-leases-1`)

- [x] 1.1 Red: `claim-lease.test.ts` in `@wbs/domain`: `leaseOf` answers T + 15 min only for a
      pin naming the claimant; `isLeaseInForce` is false at exactly the expiry; renewal is due
      only below `now + 15 min − 60 s`, with a property over instants. Green: `claim-lease.ts`.
      R5 fault: `<=` for `<` at the boundary; watched.
- [x] 1.2 Migration `add_claim_lease` (two nullable columns, partial index) with `down.sql`.
      Built 2026-10-23: no separate migration test; every SQLite test runs the forward
      migration, migration lint passes, and an outgoing release's leaseless claim is the
      `lease_expires_at IS NULL` case every human-claim test exercises. The `down.sql` has no
      guard (dropping a lease leaves the claim held, as the older image holds every claim).
- [x] 1.3 `ClaimStore` gains lease writes on `add`, `leaseExpiresAt` on stamped reads,
      `renewLeases`, `expiredLeasesOf`, `projectsWithExpiredLeases`; `CommandJournalStore`
      gains `appendEvent`; SQLite, the memory twin and conformance cases
      `claims.lease:write-renew-expire` and `journal.appendEvent:history-only`. R5 faults:
      renewal touching an expired lease; an expiry read with `<`; `appendEvent` writing a
      stack row; each watched in its conformance case on both stores.
- [x] 1.4 Claim path: a leased claim on a pinned self-claim, none otherwise; the journal's
      `add_claims` names `leased`, a replay re-leases them (L11). R5 faults: lease every
      claim; replay without a lease; watched.
- [x] 1.5 Renewal: in a committed batch by a pinned caller, and `POST /api/claims/renew`
      (contract, route, OpenAPI, MCP tool `postApiClaimsRenew`) with read-first. R5 faults: renewal skipped in the
      batch; the route entering the turn unconditionally (a held-turn test times out);
      `not_pinned` dropped; watched.
- [x] 1.6 Revocation ends leases when no other credential is live (admin revoke and MCP
      consent end), and the admin revoke requests a sweep tick (the consent end does not; its
      claims go on the next scheduled tick, L8). R5 faults: end leases unconditionally
      (revoke-one-of-two fails); skip the end (revoke-last fails); watched.
- [x] 1.7 Release: `WorkItemService.releaseExpiredLeases`, the runner's unit of work, history
      event with reason, cascade, announce; `ClaimLeaseSweep` with injected clock and
      intervals, started and stopped by boot, coalesced, catching per project (one project's
      failure is reported with its id and the tick goes on), candidates ordered by their oldest
      expired lease. The 50-project bound is passed to the read (sweep unit test) and the read
      honours a limit (conformance, limit 1); no test drives a 51st project through a tick.
      R5 faults watched: no re-read inside the turn (the sweep-behind-release case); one try
      around the whole tick; boot never starting it; project-id order.
- [x] 1.8 Model-based race test (store-sqlite): random claim, write, heartbeat, release,
      revoke (an agent's only key, through the production revoke), clock advance and sweep
      acts, with a sweep racing a heartbeat, a write or a release in either order; after every
      step the stored claims and expiries equal the model's, the slot's occupancy matches, and
      the bound-claim count equals the model's held leaves. The swarm-style case (cap 1, one
      exclusive slot, a waiting agent's retry admitted after the sweep) is in
      `claim-lease.db.test.ts`.
- [x] 1.9 Reads: `leaseExpiresAt` on startable and person work; contracts and the generated
      document.
- [x] 1.10 `CONTEXT.md` term **Claim lease**; module indexes; `verify.md` with commands,
      results and proofs.

## 2. fe-01 display (slice 2)

- [x] 2.1 Superseded 2026-10-24 by `wbs-claim-display` (C18, slices 6 and 9): the claim chip
      shows a leased claim's remaining time and an expired one as "releasing"; the history row
      reads "released (lease expired)".

## 3. Heartbeat request boundary (`fix/wbs-claims-renew-body`, PR #711)

- [x] 3.1 Red: a be-01 route test posts `{}` and `?wait=1` to `/api/claims/renew` as an agent,
      expects `400 invalid_body` / `invalid_query` and both leases still at their old expiry;
      watched answering 500.
- [x] 3.2 The renew shape declares `400 invalid_body | invalid_query`; its summary tells a raw
      HTTP agent to send no body and no query string (pinned in mcp-01 `openapi-tools.test.ts`).
- [x] 3.3 Audit: every mounted endpoint, local and OIDC tables, answers each boundary failure
      code with a declared 4xx, classifiers included; stray query and body probes through the
      production app expect `400 invalid_<part>` or a listed modeled exception.
- [x] 3.4 The eleven other endpoints the audit found declare their stray-input codes; verify.md
      rows record each fault and the observed failure.
