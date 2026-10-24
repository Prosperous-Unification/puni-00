## Context

Read on 2026-10-23 on `main` at `e70166d28` and on `plan/wbs-claim-leases` at `485972419`:

| Need                              | Exists today                                                                                                   | Missing                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Every claim of a project, at once | `ClaimStore.listStampedByProject`; startable `claimed` and `subtreeClaims` (complete only with no team filter) | a read that answers all of them             |
| A lease on the wire               | `leaseExpiresAt` on startable and person-work (leases L12); `lease_revoked_at` stored, never read              | the revocation instant on a read            |
| A client told a lease moved       | nothing: `POST /api/claims/renew` commits without an announcement; a batch renewal rides its tree              | an event                                    |
| A client told a claim went        | claim, release and the sweep (`releaseExpiredLeases`) all call `announceTree` → `tree_replaced`                | nothing                                     |
| Why a claim went                  | `plan_event` kinds `claim` and `release`; a reap's `after` is `remove_claims` with `reason`                    | a read that names holder, run, item, reason |
| Where fe-01 shows a step's person | the folded `${step}-final` cell's `ASSIGNEE_SLOT_PX` slot and the unfolded `by` column                         | the claim beside it                         |
| How fe-01 refreshes               | `plan-refresh` coordinator: resources tree, steps, directory, markers; `resourcesFor(event)`                   | a claims resource                           |
| A history view                    | none; fe-01 never calls `getApiProjectsByIdHistory`, which has no limit                                        | a bounded claim-only projection             |

The tree read (`getApiProjectsByIdWork-items`) is the whole plan, hundreds of KB on a large
project, documented to MCP as "for export only", refused `engine_unavailable` when the
optimized engine is down, and its `workItemTree` shape is also embedded in plan documents.

## Goals / Non-Goals

**Goals:** a person watching the table sees who holds each step and subtree, under which run,
and how long the lease has; a reaped or revoked claim reads **releasing** until it goes, and
the Claims sheet says why it went; a heartbeat moves what the screen says within one refresh;
an unclaimed plan looks and costs exactly what it does today.

**Non-Goals:** controls that claim or release; a general plan-history view; conditional GETs;
claims in the tree read or in the plan export; jumping from the sheet to a row.

## Decisions

All assumed on 2026-10-23 for Dany's review; each is overrulable by id.

**C1. A new complete claims read is the chip's source.** `GET /api/projects/:id/claims`
(`getApiProjectsByIdClaims`), policy as the tree read (an organization viewer reads it).
Weighed:

| Source                   | Payload per refresh          | Fresh on heartbeat                | MCP surface                        | Complete                                                                            |
| ------------------------ | ---------------------------- | --------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| Claims in the tree read  | whole tree (hundreds of KB)  | only by refetching the whole tree | none new; buried in an export read | yes                                                                                 |
| Startable read           | tree folds + fit per call    | same cost                         | exists                             | only with no team filter, at the cost of the full fold, fit and team reads per call |
| Person-work read         | small                        | one request per holder            | exists                             | per person only                                                                     |
| **Complete claims read** | one row per claim (a few KB) | cheap: refetch claims alone       | +1 tool, the "who holds what" read | yes                                                                                 |

Rejected the tree read for four reasons: a heartbeat (at most one per agent per minute) would
refetch the whole tree for every viewer; claims would go dark whenever the tree read is refused
`engine_unavailable`; agents would have to call an export read to see occupancy; and claims are
runtime occupancy, not plan, so they stay out of `workItemTree` and the export. The cost is a
second resource whose moment can differ from the tree's (C11). No ETag on either read: neither
has one today and the claims read is small (non-goal).

**C2. The claims read's rows.** `{ readAt, claims }`; each claim carries `claimId`,
`workItemId`, `number`, `numberIsFrozen`, `name` (as the startable read addresses an item),
`stepId` (`null` for a subtree claim), `holder { personId, name }`, `runId`, `parentClaimId`,
`claimedAt`, `leaseExpiresAt` and `leaseRevokedAt` (both `number | null`). Ordered by the work
item's tree position, a subtree claim before the step claims of the same item, steps in the
project's step order. `readAt` is be-01's clock at the read. The revocation instant needs the
stamped claim read to return `lease_revoked_at`, which slice 1 of leases stores but never reads.
A holder the organization's person list lacks throws, as the startable read does today.

**C3. Claims are a fifth plan-refresh resource.** `resourcesFor('tree_replaced')` answers
`['tree', 'claims']`: every claim, release, reap and cascade already announces the tree, and a
removed work item takes its claims. `plan_unavailable` stays `['tree']` (the claims read does
not need the engine). `claims_changed` answers `['claims']`. Unknown events keep answering
every resource, which now includes claims.

**C4. The renew route publishes `claims_changed`.** After its turn commits, once for each
project in which it moved at least one lease; a type-only event, so the announcement collector
deduplicates it. A batch's own renewal rides the batch's `tree_replaced` in its own project and
announces the others (C19). A revocation is not
announced: the admin revoke asks the sweep for an immediate tick whose release announces the
tree; a consent revocation waits up to one 30 s tick, during which the chip reads its old
expiry (accepted). `OptimizerTriggerBroadcaster` SHALL NOT schedule optimization for it.
Rejected: polling the claims read on a timer (a minute of drift either way, and a second
refresh path the coordinator does not own).

**C19. A batch's renewal announces the projects it moved.** An agent's committed batch renews
its leases in every project, not only the batch's own. After the batch commits, each project
whose lease moved receives one `claims_changed` through the batch's announcement collector,
except the batch's own project when the batch changed a row: that batch announces the tree
(`tree_replaced`, or `plan_unavailable` under an unavailable optimized engine), and
`tree_replaced` refreshes the claims. A batch that changed no row (empty, directory-only)
announces no tree, so its own project receives `claims_changed` too. A refused or rolled-back
batch announces nothing, and a batch within the renewal resolution moves nothing and announces
nothing. Without it, a viewer of project B watches a live agent's lease count down to releasing
while the agent works in A. Rejected: announcing the batch's own project always (a second
refresh of claims the tree event already causes). Residual: a dirty batch whose tree answers
`plan_unavailable` refreshes the tree only; its own project's claims wait for the next
heartbeat or tree change.

**C21. `claims_changed` is transient.** It is pushed live to the project's subscribers and
nowhere recorded: no `event_log` row, no replay-buffer entry, no sequence number consumed. The
claims read is a complete snapshot, so replaying the announcement is worth nothing, and N
agents' heartbeats would otherwise evict durable events from the replay window
(`ReplayOrchestrator`'s `DEFAULT_MAX_EVENTS`, 32). be-01's internal push carries no `seq` for
it, and gw-01 forwards the frame to the sockets without one. The client contract: a frame
with no `seq` is a hint to reread the resource its type names. It never advances, reads or
resets the client's resume point, and no `seen` follows it. Because a missed transient frame
is never replayed, a client rereads claims whenever its stream synchronises: on every
`resume_ack`, on `resume_denied`, and on a first subscribe. Push failures are reported and
swallowed, as a durable push's are. Rejected: coalescing to one durable event per project per
30 s (still evicts at swarm scale, and still a timer the coordinator does not own).

**C5. fe-01 learns `claims_changed` before be-01 says it.** An fe-01 that does not know the
event treats it as unknown and refreshes every resource, which at swarm scale is one full plan
read per heartbeat per viewer. The slice that narrows it lands and deploys before the slice
that publishes it. Under C21 an fe-01 that predates slice 2 drops the unsequenced
frame (its stream reads only sequenced frames) instead of refreshing everything; the order
stands so that viewers get the refresh at all. gw-01 must also deploy before be-01 sends it,
since an older gw-01 refuses a push without `seq` (400, reported and swallowed by be-01).

**C6. The lease clock is the server's.** On install the coordinator records `readAt` beside
`performance.now()`; remaining time is `leaseExpiresAt − (readAt + elapsed)`. Shown in whole
minutes rounded down (`14m`), `<1m` under sixty seconds, never seconds. One table-level ticker
at 15 s runs only while at least one leased claim is drawn and the page is visible; no chip
owns a timer. A healthy agent therefore reads `14m`, and a dying one counts down.

**C7. The step chip sits beside the assignee.** Folded cell: the chip shows the holder's
initials in the assignee's spelling, drawn as a bordered token with a hold mark so it differs
from the assignee by shape, not only by colour, in a `CLAIM_SLOT_PX` slot reserved only in
step columns where some drawn row holds a claim (the `ASSIGNEE_SLOT_PX` rule: an unclaimed plan
pays nothing). Remaining minutes are not in the folded chip: the folded cell's width already
goes to the figure and the assignee. Unfolded `by` column: the chip follows the picker and adds
the remaining minutes or `releasing`. The chip is not focusable and has no action.

**C8. A subtree claim shows on its own row.** It has no step, so its chip sits in the Name
cell after the name, before the marker lane, with the same lease text as an unfolded chip.
Leaves under it carry nothing extra; a delegated claim's card names its parent. A collapsed
parent does not aggregate the claims of hidden rows; the Claims sheet lists them.

**C9. The card says it in full.** The folded step card (`folded-step-card.tsx`) gains a claim
line: "Claimed by codex-fleet since 10:42, run `agent:claire:subagent:…`; lease 14 min left";
a delegated claim adds "under claire's claim on 080". The chip's accessible name is the same
sentence, so the folded chip is not withheld from a keyboard or screen-reader user.

**C10. Three lease states.** No lease (a human's claim): no time shown. In force: minutes.
Ended (expired, or `leaseRevokedAt` set): **releasing**, muted with a dashed edge; the card
adds "lease expired" or "credential revoked". Releasing lasts until the sweep's announcement
refreshes claims (normally under 30 s).

**C11. Moment skew is drawn as absence.** The two resources install independently, so a claim
may name a row or step the installed tree lacks, or the reverse. The table draws a chip only
where the installed tree has the row and the step; the Claims sheet lists every claim by the
claims read's own number and name. Not an error: the next covering read agrees.

**C12. A failed claims read is a rendered state.** The table keeps the last installed claims;
with no installed claims it draws no chips. Claims are optional, so their failure is not the
plan's: the plan's stale alert ("This plan may be out of date") and the optimization cue's
stale state read the plan's resources only. Claims show their own quiet status line, "Claims
could not be read.", with a `Retry claims` button that rereads claims alone and clears it by
succeeding. An older be-01 mid-swap answers its router miss (`404 NOT_FOUND`) for the route:
same state. The Claims sheet renders the failure in place. Never the Error Boundary.

**C13. Release history is a projection, not a history view.** `GET
/api/projects/:id/claim-history?limit=` (`getApiProjectsByIdClaim-history`) answers the
project's `claim` and `release` plan events newest first, `limit` 1 to 100, default 50, no
cursor. The Claims sheet shows it under the claims held now. Rejected: fe-01 reading the raw
history (its `after` is opaque, it has no limit, and a claim's label does not name the holder);
deferring it (a reaped chip would vanish with no reason anywhere on screen, the gap leases 2.1
was meant to close).

**C14. A history row's shape.** `{ eventId, at, kind, reason, claims[] }`; `reason` is
`claimed` for a claim, `released` for a release command, and the stored `reason`
(`lease_expired`, `credential_revoked`) for a reap; each claim names `claimId`, `workItemId`,
`stepId`, `holder { personId, name | null }`, `runId`, and `item { number, numberIsFrozen,
name } | null`. `null` means deleted since: history outlives people and rows. The stored command
is decoded with the journal's own decoder; an entry it cannot decode is corrupt trusted state
and throws. Undo and redo entries are not listed: the claims held now are the current answer.

**C15. No control.** Release stays an MCP or batch command, admin-bypassed as D5 of
`wbs-team-claims` says. A release button is a follow-up with its own refusal design.

**C16. Where the sheet opens.** A `Claims` toolbar button with the held count (no count at
zero), and an entry in the phone `Plan actions` sheet. Held claims are grouped by holder, then
run, each row with number, name, step or "subtree", lease text and since; recent history below.

**C17. Phone cards carry the same chips**, beside a card's step assignee and in its header for
a subtree claim.

**C18. Supersession.** This change builds `wbs-team-claims` 1.7 and `wbs-claim-leases` 2.1;
both are marked superseded there when their branches settle.

**C20. Claims never hold the stream acknowledgment.** A sequenced event's claims obligation is
not recorded against its sequence: the event is acknowledged once its other resources are
covered. A claims read is a complete snapshot, so any later one covers whatever an acknowledged
event changed, and a failed one stays visible as claims' own stale state (C12). This matches
the baseline, which anchors without claims. Rejected: holding acknowledgment as markers do, which
pins every reconnect to the baseline for as long as an older be-01 lacks the read. (C19 is not
used.)

## Risks / Trade-offs

- **Heartbeats are pushed, not logged** (C21, recorded by slice 3). Each renewal that moves a
  lease pushes one transient `claims_changed` per project, at most one per agent per minute. It
  never reaches the durable event log and a resume never replays it, so fe-01 rereads claims on
  every synchronisation of its stream. Only the plan feed opts into the announcement; the
  saved-plan shelf's socket never hears it.
- **Page load reads claims twice.** `establish` reads claims beside the anchored reads, and the
  stream's first synchronisation reads them again. The second read is the one that covers the
  interval between the first read and the socket's registration, in which an announcement could
  be pushed and lost. It cannot be skipped cheaply, because the first read always starts before
  the socket registers. The cost is one small read per page load.
- **A missed transient push is not replayed** (C21): a client whose socket drops between
  heartbeats rereads claims on resume, and a client that stays connected but misses a push
  (gw-01 unreachable) reads stale lease times until the next one.
- **A consent revocation is up to one tick stale** on screen (C4).
- **Two moments on one screen** (C11): a chip may lag its row by one read.
- **An undone claim stays in the history list** as claimed (C14); the held list is the truth.
- **Pixel budget**: C7's slot is an assumption the eye review may move (`ui-work-acceptance`).
