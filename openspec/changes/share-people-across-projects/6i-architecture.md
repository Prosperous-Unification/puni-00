# 6i: rank and directory transaction ownership

This packet is normative with `design.md`. It follows reviewed 6h implementation
`f740615` and documentation checkpoint `956dba9feb8f140112c34b66121f86794f6ccf30`.
It authorizes no activation, publication or later fan-out slice.

## Intent

Rank and standalone directory writes must record shared-person invalidations in the same
transaction as their scheduling change. Existing command and admitted settings writes already
have that owner; installing an additional repository observer beneath them would duplicate
or prematurely derive events. Preserve the existing write/refusal contracts, project history,
recovery audits, ordinary announcements and selected-display policy. Add no route, journal,
booking table or permission category. Numeric rank respacing and labels remain silent for
shared fan-out, even when an ordinary refresh event is still appropriate.

## Concrete owners at the reviewed base

| Entry                                                                                          | Current owner and required binding                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http/project-rank.routes.ts` → `ProjectRankResource.move` → `ProjectRankRepository.moveAfter` | Resource checks organization/admin role, repository acquires its gate and uses a synchronous immediate Drizzle transaction. `boot.ts` constructs this repository directly; `app.ts` passes it to rank and person-load resources. Replace the mounted write port with the composed standalone rank writer. |
| Project PATCH → `createAdmittedWrites` → `ProjectService.updateWithin`                         | 6h already observes before mutation after current read-only authority, records in its async UoW and delivers after release. Keep this single owner; prove start-date and selected-engine/objective/settings cases rather than adding another observer.                                                    |
| `/commands` directory batch → `runDirectoryWithin` → `execute(null, …)`                        | Already one 6h command transaction. No project grant or directory journal. Capture the organization's full before/after state once around the whole successful batch.                                                                                                                                     |
| Project command/prelude → Working plan → `createWorkingPlanDirectory`                          | Raw directory mutations run under the command's OPEN stores; successful global writes reload the Working plan, assignment refreshes addressed rows. Keep refresh semantics and let the enclosing command capture once.                                                                                    |
| Public `DirectoryService` mutation → `DirectoryRepository`                                     | Standalone store mutations acquire their own gate and use synchronous Drizzle callbacks. Public composed directory writes need an explicit outer async owner. Preserve the store mutation's existing atomic boundary.                                                                                     |
| Import and replay repair                                                                       | Use raw OPEN stores in the already-owned scope. Import fan-out is 6j. Stale journal repair remains its existing surviving `NO_ADMISSION` act; it must not acquire a standalone directory owner or emit rolled-back fan-out.                                                                               |

The mounted directory route file contains reads. Directory HTTP mutations enter the command
runner; there is no separate directory mutation route to invent or bind. Standalone service/DB
proofs must call the installed public writer, while command proofs must exercise the borrowed
writer. A direct low-level `new DirectoryRepository(db, OPEN)` is not a composed public writer.

## Resolve synchronous ownership now

Rank and directory already use synchronous Drizzle transactions, so the async-capture ownership
choice is needed in **6i**, not first in 6j. Choose an explicit outer `sqliteUnitOfWork` owner:

1. Acquire the source write turn and `BEGIN IMMEDIATE`.
2. Resolve addressed ownership and old scheduling/resource usages in that transaction; capture
   the relevant shared organization(s) on its borrowed writer with the 6h captured scheduler.
3. Invoke the existing raw OPEN repository operation. Its synchronous transaction becomes an
   inner savepoint. Never pass an async function to that Drizzle callback.
4. On modeled refusal, return `commit:false`; on success, capture after and use
   `recordCommittedFanout` through this scope's event-log store before returning `commit:true`.
5. After the UoW returns and the writer releases, deliver exact committed envelopes through
   `CommittedFanoutDelivery`; existing ordinary service announcements follow as today.

A wrapper must not call a public gated repository while holding the same source turn. It must
not call `uow.run` from an admitted store, use a detached read connection, put capture in an
announcement callback, or open a second independent event transaction. The repository SQL and
its conditional refusal checks remain authoritative inside the owner. A store refusal cannot
commit a provisional event or advance the sequence. Capture/event errors roll back domain,
audit/revision, event and sequencer writes together and propagate. No delivery runs on rollback.

## Interface and installation contract

Implement two explicitly distinct compositions, with symbol JSDoc describing ownership:

- **Standalone public writes:** source-bound wrappers own the async UoW and post-commit delivery.
  Their directory surface conforms to `DirectoryStore`; their rank surface conforms to
  `ProjectRankStore`. Reads delegate normally. Each top-level store mutation invokes one owner
  and one raw mutation, including repository methods that internally perform several writes.
- **Borrowed writes:** `Scope.stores.directory` and the transaction's rank store are raw OPEN
  repositories. They never install a standalone observer or delivery callback. Working plan
  wrappers delegate to these stores. Command/import/repair composition chooses them explicitly,
  rather than inferring ownership from a runtime lock or a global suppression flag.

A source-neutral composition wrapper may orchestrate `Source.uow`; SQLite keeps connection,
gate and organization/usage queries in the adapter. Expose the rank store on the transactional
source catalog (and memory fixtures as required) so the wrapper can invoke `moveAfter` on its
own scope. Expose the composed rank writer from `buildServices` and pass it through `boot.ts`
and `app.ts`, including the production-shaped organization harness. The person-load read may
share its `orderIn` implementation. Do not leave boot constructing an unobserved rank writer.

For standalone directory organization resolution, add a narrow transaction-bound capability
beside `FanoutCaptureStore`: given a typed directory write address (catalog/resource identity,
or the work-item/project identity for assignment), resolve ownership and resource users on
that same scope. Keep SQL and raw directory tables out of core. Address name-idempotent writes
by their actual existing identity as well as the proposed identity; a create that joins new
memberships to an existing person is a scheduling mutation. Root/mapping-only inserts with no
scheduling users do not fabricate a cause. Preserve old ownership/usages before deletion and
relinking; resolve new usages after the mutation and union the affected organizations/projects.

Capture every organization that can be affected **before** mutation. If an operation can add
references to another addressed resource, resolve its ownership in the before phase as well;
do not discover an uncaptured organization only after writing and silently omit it. A missing,
malformed or inconsistent trusted ownership relation throws. Existing legacy/pre-activation
and isolated modes remain typed silent paths; no shared read may be triggered for legacy work.
Existing scoped foreign-resource checks continue to reject corrupt cross-organization reach;
fan-out is not permission to broaden human read authority or repair corrupt ownership.

Install the public wrapper only where no encompassing owner exists. Raw store construction is
still useful for migrations, fixture setup and already-owned scopes; it does not promise fan-out.
The production public directory graph and source-bound standalone test fixture must use the
installed wrapper. Public `DirectoryService.patchPersonWithin`/`patchTeamWithin` can perform a
rename and a link patch as separate store calls today; 6i preserves those existing standalone
store boundaries. Mounted compound operations remain atomic under their command UoW. Do not
claim a newly atomic whole standalone service operation or independently publish intermediate
fan-out from a compound command.

Rank access remains organization-required and admin/super-admin only, with no recovery grant,
audit or journal added. Preserve foreign/absent addressed projects as `not_found` and the
self-move no-op. Any current-authority check added at the new owner must run before capture,
model its refusal explicitly and retain the same role policy; prove it through the mounted
path rather than trusting request preflight as a transaction observation.

## Comparison and cause contract

The before/after organization values include authoritative rank order, dates/settings,
assignments/resource-derived scheduling input and the actual selected displayed schedule.
Borrowed capture remains read-only with respect to optimizer generation/cache/slot/queue state.
Reuse 6g projection and 6h event delivery, including recipient optimizer notification before
any transport await, and command grant expiry before that delivery.

Derive rank causes from changed **relative ordering of project identities**, not stored numeric
positions or shifts in an ordinal. Both identities of a reversed surviving pair are direct
causes. Preserve the 6h changed shared-connection endpoints and changed local scheduling facts.
Do not promote a merely propagated downstream input hash into an additional direct cause.
A move may rewrite every rank row; a move leaving the identity order unchanged must emit no
shared event or sequence increment. Unconnected reorderings still pass through the same
projection/recipient filter, rather than receiving a blanket broadcast.

Directory causes include every project's changed scheduling facts/resource usages, even when
no project row changes. Keep old usage/assignment evidence after a person or team is removed.
Full affected-organization before/after capture is acceptable and already supplies the old/new
scheduling and assignment values; adapter usage queries select affected organizations, never
replace the old graph with only a post-delete list. Name-only changes supply no scheduling
cause. The existing 6g comparator traverses old and new graphs separately and deduplicates
recipient/cause pairs for the whole owner; do not merge edge sets before traversal.

Settings/start-date edits retain the 6h admitted owner. Cover dated↔undated transitions and
selected optimized versus Fast display, including engine/objective-only changes where a local
input hash can stay equal. Neither a local hash equality shortcut nor a new repository wrapper
may bypass display/availability comparison. An unchanged label or identical setting is silent
for shared fan-out. Ordinary project/directory events and their existing triggers are preserved.

## Required RED tests and watched R5 faults

Every row needs a restored passing run, the injected-fault failure and an adjacent `Proof:`
comment at the production guard/binding. A failure in an earlier unrelated branch is not proof
of the named path. Reuse 6h helpers, but run standalone and borrowed cases separately.

| Witness                                                       | Required observation and independent fault                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mounted rank reorder compares both directions                 | Cold dated A/Ana → B/Ana with distinguishable selected bookings; reverse order. Check exact old/new-direction recipient/cause rows, durable payload/sequence, no history. Omit the composed rank binding; required rows disappear.                                                                                                                                                                      |
| Rank respacing is silent                                      | Arrange sparse/tied/unranked positions; move to the already-current place so the repository physically rewrites rank rows without changing identity order. Assert zero shared rows/sequence change. Derive causes/events from numeric rank changes to watch the witness fail. Retain self-move and foreign-target refusal cases.                                                                        |
| Owner observation defeats stale preflight                     | Pause after public preflight but before the acquired turn; another real connection changes rank or assignment. Expected pairs use the state admitted by the writer. Substitute the earlier preflight snapshot and observe wrong/missing pairs. Keep this separate from detached-after-capture failure.                                                                                                  |
| Standalone directory removed assignment preserves old closure | Through composed public directory service/store, cascade-remove a person used in a multi-project bridge. No project row changes; exact old-closure pairs commit. Omit only the standalone wrapper, then use only post-write usage independently; each loses required rows.                                                                                                                              |
| Standalone directory multi-resource mutation                  | Patch team/service links or person memberships/kind that affect scheduling; include name-idempotent add joining an existing person. Capture before/after resource users inside the owner. Unknown linked resource/in-use refusal leaves domain, events and sequences unchanged. Force a refusal after a provisional event to prove rollback, not just an empty no-op.                                   |
| Borrowed directory emits once                                 | Mounted project batch performs several directory writes and an assignment change; project-null directory batch separately edits multiple used resources. Expected distinct pairs appear once after the whole batch. Install standalone wrappers beneath OPEN stores or per intermediate write; witness duplicate/intermediate rows or nested-owner refusal. Do not accept a hang as the only assertion. |
| Working plan remains current                                  | Mix directory mutation and later scheduling command; the captured after-state and later command see refreshed collections. Remove the reload/row refresh to observe stale behavior. Refuse a later command and verify no shared rows/push/trigger escape; retain stale replay repair and grant-lifetime tests.                                                                                          |
| Settings/date owner is retained                               | Mounted PATCH exercises start date, dated↔undated and selected ready optimized display; compare exact recipient pairs with one owner. Omit only admitted settings binding. Add a redundant standalone observer to show duplicates. Rename/identical settings produce zero shared events.                                                                                                                |
| Standalone second-event failure is atomic                     | Inject failure on a later downstream insert after one recorded row. Compare directory/rank mutation, revision/audit, log and sequencer with before; no push/optimizer callback. Move record after UoW return and observe persisted mutation/partial event. Rank and directory require separate witnesses.                                                                                               |
| Standalone delivery releases writer                           | Hold committed transport; independent SQLite writer succeeds and recipient optimizer notification has already run. Move delivery into owner and observe blocked writer/premature delivery. Exercise rank and directory independently; normal push failure leaves replayable rows and notified recipients.                                                                                               |
| Legacy/isolated and unavailable wiring                        | Throwing shared dependencies must remain unused for legacy work; isolated capture produces no shared events. Omit required production public-writer/capture/delivery wiring independently and make the corresponding mounted/service witness fail closed or miss its required event. A raw fixture that never uses the composed writer cannot prove installation.                                       |

Preserve physical capture-error tests, selected-ready-optimized capture/no-live-admission
proofs, command refusal/undo/redo grant expiry, scoped step recovery's single audit and bare
`NO_ADMISSION` behavior. No need to repeat unchanged 6h fault injections merely to relabel them
6i; new ownership/binding checks require their own production-path negatives.

## Exact Sol handoff

1. Start from this packet commit after review. Add failing rank controller/SQLite tests and
   standalone directory service/DB tests from the matrix. Inventory production constructors;
   distinguish fixture-only raw stores from public composed writers.
2. Introduce the source-bound standalone owner and transaction-bound directory ownership/usage
   address capability. Keep raw OPEN stores in command/import/repair scopes. Bind the composed
   rank port in boot/app/harness and public directory mutations in composition. Add symbol
   JSDoc defining owner, refusal, throws, borrowed lifetime and delivery timing.
3. Reuse capture/projection/record/delivery values from 6h. Add relative-order cause derivation
   where needed; preserve label/respacing silence and selected optimized display. Do not add
   per-intermediate command observations or observer state retained between operations.
4. Exercise project settings/date and both directory batch entry points to prove existing 6h
   ownership remains single. Preserve Working plan reloads, repair and grant settlement.
5. Watch each new fault independently, restore it, run affected focused suites, affected Nx
   lint/typecheck and declared builds, changed-path format, pinned OpenSpec 1.12.0 strict/all,
   diff and normal hooks. Record exact logs/failures/limits in `verify.md` and request independent
   implementation review before checking 6i or beginning 6j.

No product code is part of this checkpoint. Import/final deletion, optimizer display writes,
replay acceptance, activation/UI, exact-SHA host gate, CI, push and merge remain separate.
