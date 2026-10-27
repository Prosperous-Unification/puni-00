## 0. Before slice 1

- [ ] 0.1 Dany confirms or amends C1 to C19 (proposal.md, design.md); in particular C1 (a new
      read, not the tree read), C4 (heartbeat events), C7 (no minutes in the folded chip) and
      C13 (a claim history read rather than a history view). Slices build on the assumptions;
      an amendment lands as a follow-up slice.
- [x] 0.2 `wbs-claim-leases` slice 1 (PR #671) is on `main`; it is merged into this change's
      branch (merged, not rebased: `plan/wbs-claim-display` is shared). Slices 1, 3, 6 and 8 need its fields and the renew route.

## 1. Complete claims read (be-01)

- [x] 1.1 Red: `ClaimStore` stamped reads return `leaseRevokedAt`; conformance case
      `claims.lease:revoked-instant-read` on SQLite and the memory twin. R5 fault: the SQLite
      mapper drops the column (reads `null`); watched on both stores.
- [x] 1.2 Red: `project-claims.test.ts` in core on the memory store: every claim whatever the
      leaf's status (blocked, on hold, done), subtree before step claims, tree then step
      order, delegated `parentClaimId`, lease and revocation instants, `readAt` from the
      injected clock, an absent holder throws. Green: the claims feature. R5 faults: filter
      through the startable fold (the blocked-leaf case reddens); sort by claim id (the order
      case reddens); watched.
- [x] 1.3 Contract `readProjectClaims` in `@wbs/contracts`, route, policy as the tree read,
      OpenAPI emit, MCP tool `getApiProjectsByIdClaims` by derivation — test: route tests for
      viewer, member, stranger, foreign project; the read answering while the tree read is
      refused `engine_unavailable`; the MCP tool count moves by one. R5 fault: drop the
      organization-resource policy and the stranger's read passes; watched.

## 2. Claims as a refresh resource (fe-01; deploys before slice 3)

- [x] 2.1 Red: `plan-refresh.test.ts`: `resourcesFor('claims_changed')` is `['claims']`,
      `tree_replaced` is `['tree', 'claims']`, `plan_unavailable` stays `['tree']`, unknown
      events include claims. Green: the fifth resource. R5 fault: map `claims_changed` to
      nothing (it falls through to every resource); watched.
- [x] 2.2 Red: coordinator tests per the `plan-refresh` delta: claims install independently,
      a held claims read does not block a tree install, a failed claims read keeps the last
      claims and its stale state across a later tree success; the installed claims carry
      `readAt` and the install's monotonic instant. R5 fault: share the tree's generation for
      claims; watched.
- [x] 2.3 Red: a 404 from the claims route (an older be-01) renders the plan with no chips and
      the stale notice, never the Error Boundary — test: the table with an injected API.

## 3. Heartbeat announcement (be-01)

- [x] 3.1 Red: renew-route tests: one `claims_changed` per project with a moved lease, none for
      a heartbeat within the minute, none when the turn refuses `not_pinned`; published after
      commit. Green. R5 faults: publish before commit (a rolled-back renewal still announces);
      publish unconditionally (the within-the-minute case reddens); watched.
- [x] 3.2 Red: `optimizer-trigger-broadcaster` ignores `claims_changed` — test: no run
      scheduled. R5 fault: remove the exclusion; watched.

- [x] 3.3 Red: a batch's renewal (C19): an agent with leases in A and B commits a batch in A,
      B gets exactly one `claims_changed` and A none; none within the minute; none for a refused
      or rolled-back batch. Green: announce through the batch's collector. R5 faults: drop the
      announcement; drop the own-project filter; publish through the outer broadcaster; the
      store answers before its write; the store answers every in-force project; watched.

- [x] 3.4 Red: a batch that changed no row (empty, directory-only) announces its own project
      too (C19 as amended after review). R5 fault: drop the dirty test; watched.
- [x] 3.5 Red: `claims_changed` is transient (C21): `GatewayBroadcaster` pushes it with no
      `seq`, records and buffers nothing, and swallows a failed push; the internal push
      contract's `seq` is optional and gw-01 forwards the frame without one. R5 faults: treat it
      as durable; rethrow a failed push; require `seq` again; watched.
- [x] 3.6 Review fixes: the SQLite renewal names its projects from `UPDATE … RETURNING` in one
      statement; the memory twin finds every due row's project before moving any; the
      conformance case asserts two projects in code-unit order. R5 faults: unsorted,
      undeduplicated, rows moved before the lookups, in-force rows; watched.

- [x] 3.7 Red: the socket vocabulary names the transient frame: `WsTransientFrame` and
      `wsTransient` in `@wbs/contracts` (no `seq`, and a `seq` makes it not transient); gw-01
      builds it; the generic realtime client hands it to a required `onTransient` without
      touching its resume point. R5 faults: drop the client's arm; drop the guard's arm; advance
      the tracker; let the contract accept a `seq`; watched.

**Merge order:** this slice merges into `plan/wbs-claim-display` only after slices 1 and 2 have
reached `main` and deployed (C5), and gw-01 with the optional `seq` deploys no later than be-01
(C21).

## 4. Step claim chip (fe-01; builds `wbs-team-claims` 1.7, steps)

- [x] 4.1 Red: table rendering tests with a claim-shaped read: folded chip with the holder's
      initials beside the assignee slot, unfolded chip after the picker, card claim line
      (holder, run, instant), chip accessible name, no slot in a column without a claim, an
      unclaimed plan's column widths equal today's. Green: `CLAIM_SLOT_PX` and the chip. R5
      faults: reserve the slot unconditionally (the width case reddens); drop the accessible
      name; watched.
- [x] 4.2 Red: a claim on a work item or step the installed tree lacks draws nothing and does
      not throw. R5 fault: look the row up with a throwing accessor; watched.

## 5. Subtree claim chip (fe-01; builds `wbs-team-claims` 1.7, subtrees)

- [x] 5.1 Red: a subtree claim's chip in its row's Name cell, none on the leaves under it, none
      on a collapsed ancestor; a delegated step claim's card names the parent's holder and
      number. Green. R5 fault: inherit the chip down the tree; watched.

## 6. Lease display (fe-01; builds `wbs-claim-leases` 2.1, chip)

- [x] 6.1 Red: `claim-lease-view.test.ts`, a pure function of (lease end, revocation, `readAt`,
      install instant, now): minutes rounded down, `<1m`, releasing at exactly the end,
      revoked reads releasing with its cause, no lease reads nothing; a property that the
      browser's wall clock never changes the answer. Green. R5 fault: `Date.now()` in place of
      the server instant (the clock-ahead case reddens); `<` for `<=` at the end; watched.
- [x] 6.2 Red: one table-level ticker at 15 s while a leased claim is drawn and the page is
      visible, none otherwise — test with fake timers and a visibility toggle. R5 fault: a
      timer per chip (the count assertion reddens); watched.

## 7. Phone cards (fe-01)

- [x] 7.1 Red: `plan-cards` tests: a step chip beside the card's step assignee, a subtree chip
      in the header, the same lease text. Green.

## 8. Claim history read (be-01)

- [x] 8.1 Red: `claim-history.test.ts` in core: claim, release and reap events newest first,
      reasons `claimed`, `released`, `lease_expired`, `credential_revoked`, deleted holder
      and item read `null`, undo and redo entries absent, `limit` default 50 and bound 100,
      an undecodable stored command fails the read. Green: decode with the journal's own
      decoder. R5 faults: skip an undecodable event (the corrupt case reddens); read the reason
      from the label; watched.
- [x] 8.2 Contract `readClaimHistory`, route, policy as the tree read, `limit` refused outside
      1 to 100 as `400 invalid_query`, MCP tool `getApiProjectsByIdClaim-history` by
      derivation — test: route tests and the tool count moving by one.
- [x] 8.3 Review of #706 (S1-1): claims and releases inside a multi-command batch.
      `PlanEventFilter.batchesHolding` keeps a `batch` event whose stored command holds
      `add_claims` or `remove_claims` at any depth (`json_tree` on SQLite), before the limit;
      each such step is one entry with an `act` index; conformance case
      `planEvents.listFor:batches-limit` (also pins the limit and its refusal of 0, -1, 1.5).
      R5 faults: batch clause removed per store; text match in place of `json_tree`; batches
      filtered after the store limit; post-expansion cut removed; both-in-one-step and zero-act
      checks skipped; `before` matched; a be-01 batch through `POST /commands`; watched.

## 9. Claims sheet (fe-01; builds `wbs-claim-leases` 2.1, history row)

- [x] 9.1 Red: sheet tests: the toolbar button's count (absent at zero), held claims grouped
      by holder then run with lease text, claims the tree lacks still listed, history rows
      with reasons, a history read failure rendered in place while the held list stays, the
      history re-read on a tree change while open and not on `claims_changed`; no claim or
      release control. Green. R5 fault: re-read history on `claims_changed` (the request-count
      assertion reddens); watched.
- [x] 9.2 The phone `Plan actions` sheet offers the Claims sheet — test: the phone sheet case.

## 10. Proof and record

- [ ] 10.1 Dev by eye (UI work acceptance): a swarm of at least two agents and a human claim on
      dev; chips, a countdown after the agent stops heartbeating, releasing, the sweep's
      release, the history row; screenshots recorded in verify.md. Dev by-eye owed (dev is
      Dany's); a local rehearsal on this branch is recorded under "Local swarm rehearsal".
- [x] 10.2 `CONTEXT.md` terms (already added), module indexes for the new reads, the fe-01
      claims resource JSDoc; `verify.md` with commands, results and proofs; mark
      `wbs-team-claims` 1.7 and `wbs-claim-leases` 2.1 superseded by this change.

## 11. Human claims and distinct marks (fe-01; from the 10.1 dev check, 2026-10-26)

- [x] 11.1 Red: `initials.test.ts`: `claude-code`/`claude-code-worker` read `CC`/`CW`; a
      property that distinct names give distinct marks; uncontested initials kept; order
      independence. Table: chips and the assignee slot use the plan's marks (C22). R5 faults:
      `initialsOf` per name; the second loop's `taken` check removed; the chip and the slot
      printing `initialsOf`; watched.
- [x] 11.2 Red: `claim-offer.test.ts` (claimant and offer, pure) and
      `plan-claim-actions.test.tsx` (table and phone card): Claim after the statuses, claimed for
      the bound person with no lease, Release on a held row, refused for an unbound account and a
      done row, absent with no account; `project-page.test.tsx`: the routed page offers it
      (C23, C24). R5 faults: agents counted; missing `accountId` read as unbound; Release never
      offered; done arm dropped; claims not reread; no claim items in the column; `holdersOn`
      empty; card arm dropped; page not passing the account; watched.
- [x] 11.3 Red: `claim-refusal-words.test.ts`: holders, runs and the short resource named from
      the refusal body; every bare claim code worded. R5 faults: body sentence returning null;
      bare entries struck; watched.
- [ ] 11.4 Dany confirms C22 to C24; the 10.1 dev by-eye rerun includes a human Claim and
      Release from the row menu, with an account bound in the Directory.
