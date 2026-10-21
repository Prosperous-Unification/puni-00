# External admission / graph integration ruling

Read-only ruling against feature HEAD `3980e0bb5064361433709275625190e843c6a44e`, D3/D4 and tasks 3.2/4.2/4.3/4.4. I also inspected the uncommitted capture worktree `/tmp/puni-cross-capture` (HEAD `1e10d5fbf3d5993c1fb46a1aad9256011535b592`), especially `source.ts`, `sqlite-unit-of-work.ts`, `chain-snapshot.ts` and `fanout-capture.ts`. That inspection is not approval of its changing implementation. The preceding admission, graph, lifetime and graph-review reports remain binding where this document does not make their previously open composition choice concrete.

## Decision and completion boundary

Run one coupled integration lane for endpoint contracts, current command authority, checked endpoint evidence, the real connected graph facade, owner-local refresh and typed-link history/replay. Do not assign those seams to concurrent writers. The next lane must use `ConnectedDependencyGraphReader`, not a permissive test guard or a graph callback returning null.

Choose **principal propagation** through the runner. Supply its revalidation implementation at composition, bound to the existing process SQLite connection. Do not put account stores, `OrganizationAccess`, a mutable current principal, or a SQLite lifetime on generic `Scope` or `PlanTransactionalStores`.

There are two different positive proofs. A real admitted SQLite transaction can create/update/remove an external relationship, journal its remote preconditions, undo/redo it and commit without scheduling. A fully mounted `PlanCommandRunner` success also performs shared fanout and a post-commit tree announcement. The latter cannot honestly pass before connected derivation and announcements exist. Complete the former now, retain the production authoring barrier, and leave the mounted-positive obligations and their checklist items open. An internal transaction proof is not a claim that task 4.2 or the feature is complete.

## 1. Current command authority: exact propagation

Add a required composition port beside `organization-access.ts`:

```ts
type CommandCaller =
  | {
      readonly kind: 'human';
      readonly principal: AuthenticatedUser;
      readonly expectedAccess: ResourceAccess;
    }
  | { readonly kind: 'legacy'; readonly actorId: string };

interface CommandAccess {
  resolve(caller: CommandCaller): Promise<OrganizationAccessResolution>;
}
```

`legacy` is solely the existing explicit actor-ID legacy API; it is not a fallback for omitted principal evidence. Its SQLite implementation rereads the durable organization activation marker and permits it only before activation; after activation it returns the existing `no_active_organization` refusal. A principal is never fabricated from actor ID plus organization ID. Project-owned maintenance is a separate trusted composition entry with a real owned-project capability, not this legacy arm and not a synthetic human.

For `human`, the adapter calls the real `SqliteOrganizationAccess.resolve(principal)` **inside the UoW**. Its `activeOrganizationOf` uses the same browser cookie verifier and a revocation reader over the same process DB as the writer. Delegated principals retain their verified delegation, authentication pair and organization-operation evidence. After resolution compare the resolved kind and, when scoped, organization ID with `expectedAccess`; a changed context returns `organization_context_changed`. Do not compare the old role: use the freshly resolved role. Identity must agree with `principal.id`; caller-supplied scope user IDs cannot lend another identity. Preserve credential-rule refusal bodies rather than converting SSO/reauthentication refusals to a generic indexed dependency error.

This reruns current binding, revocation, membership, credential rules and expected-context policy. It does not invent token verification from IDs or claim to refresh/reverify the MCP signature: the verified delegation is request evidence, and the current organization policy is reread. Preserve the existing verified credential expiry/cookie policy in the browser resolver; test a queue crossing its expiry as well as revocation.

Change the authenticated runner entrypoints to:

```ts
runWithin(projectId: string, actor: AuthenticatedUser,
  commands: readonly PlanCommand[], expectedAccess: ResourceAccess)
runAfterWithin<R>(projectId: string, actor: AuthenticatedUser,
  prelude: BatchPrelude<R>, commands: readonly PlanCommand[],
  expectedAccess: ResourceAccess)
runDirectoryWithin(actor: AuthenticatedUser,
  commands: readonly PlanCommand[], expectedAccess: ResourceAccess)
undoWithin(projectId: string, actor: AuthenticatedUser, expectedAccess: ResourceAccess)
redoWithin(projectId: string, actor: AuthenticatedUser, expectedAccess: ResourceAccess)
```

The runner derives `actorId` and `credentialPairOf(actor.authentication)` itself. Remove the independently supplied actor ID/credential pair from these APIs. Keep `run`, `runDirectory`, `undo`, `redo` as explicit legacy wrappers using `CommandCaller.kind = 'legacy'`. The write-scope check remains before mutation in `runCommandBatch`/`runCommandBatchAfter`, and the direct authenticated runner entry also refuses a principal without write scope; direct invocation must not bypass that boundary.

Required callers: both command endpoints and undo/redo in `core/http/work-item.routes.ts`; the step prelude path in `core/http/step.routes.ts`; `run-command-batch.ts`; runner execute/walk; typed route outcome mappers; PlanCommands DI `contract/check/module` and fixtures. MCP continues using the generated existing HTTP batch route; it gets no second admission implementation.

Add required `commandAccess: CommandAccess` to `PlanCommandsSource`, the core composition runtime requirements and `AppOptions.writes`, and pass it into `commandTransaction`. Both runner constructions must receive it: core `compose.ts` and `be-01/app.ts:mountedEndpoints`. The latter currently constructs a second runner; updating only `services.commands` misses production HTTP.

In be-01 split the organization-authority construction out of `browserComposition`: construct the access resolver and binding verifier over `source.db` before `buildServices`, pass the same revalidator to `buildServices`/core and the mounted runner, then attach auth-dependent browser endpoints after services exist. Use the same injected clock. No late mutable resolver slot. The source still owns the process connection; no new connection and no public coordinator-gated UoW is entered by revalidation. An explicit legacy resolver is permitted in legacy-only fixtures; there is no optional production default.

### Admission and lifetime inside composition

Extend `CommandAdmission` with required `resolveAccess(caller)` mapped privately to `CommandAccess.resolve`. In each execute/walk callback, resolve first, then use the fresh access for `refuseOutsideScope`, cross-reference checks, bindings and replay. `refuseOutsideScope` keeps `admitEditInOrganization`, including recovery audit; directory admission uses the freshly resolved role. Grant the existing one-owner/one-actor `grantAdmission` only after success. Context refusals remain unindexed whole-request outcomes. Recovery audit must roll back with any subsequent refusal.

Create a command-observation lifetime as a closure owned by `commandTransaction`, inside each `uow.run` callback. It is open through `act`, final fanout capture and event recording, and irreversibly closed in `finally` before returning the UoW decision. The closure is a core composition concern, not a new generic Scope field. The SQLite snapshot lifetime remains independently adapter-owned as already ruled. Every graph/evidence method checks before reads, after awaited boundaries, and before returning; each `openCommandGraph` also has a close flag so its capabilities expire with that graph. A second run never revives either closure. Keep grant expiry before held delivery and on thrown paths.

The new bound context passed to the service factory is explicit:

```ts
interface CommandGraphAuthority {
  readonly projectId: string | null;
  readonly actorId: string;
  readonly access: ResourceAccess; // freshly resolved in this act
  readonly admission: EditAdmission;
}

interface DependencyContext {
  readonly graph: DependencyGraphGuard;
  readonly endpoints: DependencyEndpointEvidence;
}

type AdmittedGraphFactory<G> = (
  scope: Scope,
  broadcast: Broadcaster,
  admission: EditAdmission,
  dependencies: DependencyContext,
) => G;
```

Use `openCommandGraph(retainedProjectId: string | null, broadcast: Broadcaster, authority: CommandGraphAuthority)`. It constructs the dependency context from **rawScope** and the checked authority, and only then constructs the owner WorkingPlan when `retainedProjectId` is non-null. A non-null retained ID must equal the authority's owner. Execute retains its owner; walk preserves its current unretained replay graph by passing null while authority.projectId still names the actual owner. Thus null retention never means null authorization. Pass the context separately to the factory; never reconstruct it from `{ stores: workingPlan.stores }`. It holds no remote writer. A directory graph has both owner and retained ID null and gets a concrete rejecting endpoint capability and a graph capability which refuses project operations; it cannot mint a project grant.

For direct scoped service use, enter the same mapped transaction, resolve/admit the owner and obtain this bound service graph; invoke the service there. Do not add a public `WorkItemService` overload accepting an organization ID as authority. Existing public/legacy-only fixtures may use explicit local-only capabilities, which must inspect incidents and refuse if any external relationship is present. Public typed methods cannot acquire external authority from `CREATOR_ADMISSION`, a row's ownership, or a missing option. `NO_ADMISSION` still refuses every write. The required capability, actor/owner equality and lifetime checks apply to direct service calls as well as commands.

Repair remains journal-only. Map `CommandRepair.discardEntry` directly to the fresh repair scope's `journal.discard`; it needs no service graph or dependency capability. Never attach expired graph/evidence authority to `createRepairScope()`.

## 2. Checked endpoint evidence, not a wider writer

Implement `DependencyEndpointEvidence` in a core module beside dependency admission, composed from raw admitted stores and authority. It exposes detached values only:

```ts
interface WorkItemAddress {
  readonly projectId: string;
  readonly workItemId: string;
}
interface EndpointEvidence {
  readonly endpoint: ScopedDependencyEndpoint;
  readonly isLeaf: boolean;
  readonly revision: number;
  readonly name: string;
  readonly projectAbbreviation: string;
  readonly workItemNumber: string;
  readonly step: null | {
    readonly id: string;
    readonly name: string;
    readonly code: string | null;
    readonly position: number;
  };
}
interface ScopedRevision extends WorkItemAddress {
  readonly revision: number;
}
interface DependencyEndpointEvidence {
  readEndpoint(
    endpoint: ScopedDependencyEndpoint,
  ): Promise<
    | { readonly ok: true; readonly evidence: EndpointEvidence }
    | { readonly ok: false; readonly reason: 'not_found' | 'forbidden' | 'unknown_step' }
  >;
  readRevisions(
    addresses: readonly WorkItemAddress[],
  ): Promise<
    | { readonly ok: true; readonly revisions: readonly ScopedRevision[] }
    | { readonly ok: false; readonly reason: 'not_found' | 'forbidden' }
  >;
}
```

Use the repository's actual number/step-position value types when defining these fields; the essential contract is exact detached identity/label/revision evidence, not a new numbering representation. A whole endpoint's `step` is explicitly null. Derive numbers with existing canonical numbering, including frozen numbers, only after project authority and row ownership are proved. Do not return remote trees, repositories, arbitrary lists or writes. `readRevisions` deduplicates exact `(projectId, workItemId)` addresses and returns one entry for every requested current row; it never skips a missing remote row.

The enclosing admitted authority is owner- and actor-bound. Each call verifies it is active. Local-only legacy capability cannot inspect remote endpoints. Scoped capability checks `findInOrganization` before reading labels/tree/steps, then exact work-item ownership and exact step ownership. Same-organization restricted projects are readable: do not call predecessor `admitEditInOrganization`. Missing proposed evidence is modeled concealed not-found; malformed/unreadable trusted records throw. Preserve `unknown_step` only for the existing wholly local relationship path; external relationship admission maps any missing/wrong-project step, including its owner-side step, to concealed not-found. Graph reads of a required persisted endpoint which cannot be proved throw, rather than treating its edge as absent.

Service input becomes `{ predecessor: ScopedDependencyEndpoint; successor: ScopedDependencyEndpoint; type: string }`. Wire normalization and binding attach local project IDs; services never overwrite an explicit project. If maintaining a local convenience API, it must be separately named and call the scoped implementation after explicitly attaching the known owner; no optional project field crosses this boundary.

Sequence in add/update/remove: owner admission; proposed successor owner equality (before any second successor read); owned relationship lookup for update/remove; evidence for all old and proposed endpoints; endpoint shape checks in each own project; scoped duplicate key comparison; complete resulting-state graph; storage write; local refresh; history recording. Update/remove revalidate prior endpoints even when the proposed replacement is local. Use `formatScopedDependencyKey` for duplicate and journal equality, not `formatTypedDependencyKey`, which loses project identity. Label all records using checked captured endpoint names/qualified references, never `nameOf(ownerRows, remoteId)`.

Keep the earlier wire forms, normalization order, aliases and refusal mapping. `refuseForeignReferences` continues guarding ordinary local references. It must neither send explicit typed endpoints through its owner-only checks nor exempt unrelated local operations; typed endpoint admission owns those scoped references.

## 3. Graph construction and callers

Make `DependencyGraphGuard` a facade over a **required** `ConnectedDependencyGraphReader`. Remove its raw-stores constructor and owned-empty shortcut. Expose the existing `findCycle(projectId, change)` and `findStepReferences(projectId, stepId)` to callers. Extend `DependencyGraphChange` with explicit owner-local `rows`, `steps`, `estimates`, `legacy`, `reach` and complete owned `typed`; preserve `withoutStepId` as a convenience transformation.

One evaluation calls `reader.read([projectId], [{ projectId, ...explicitChanges }])`, removes `withoutStepId` from that project's captured `steps` and `estimates` if requested, then calls `findStepNodeCycle(resolveConnectedDependencyGraph(captured).graph)`. Do not apply that filter to other projects. Omitted changes mean stored facts; empty arrays mean replacement with empty facts. `findStepReferences` delegates to the connected reader's incident implementation. It matches endpoint project plus step ID.

Construct the reader from raw `projects`, `workItems`, `estimates`, `dependencies`, `typedDependencies.listIncident`, each wrapped by the command lifetime. Its `ConnectedGraphReadAuthority.requireProject` permits only the freshly admitted organization's readable projects. The local-only capability requires the requested owner and proves no incident external edge; it cannot be used as a fallback when a scoped context is missing. No cache spans guard evaluations. No scheduler, calendar, livePlan capture, held reduction or second connection belongs here.

Inject the **same** facade instance into ProjectService, StepService and WorkItemService through `ServicesOverOptions`/DI. Remove WorkItemService's `new DependencyGraphGuard(opts)` at construction. The current core `servicesOver` constructs a guard from its already-narrowed stores; replace that construction with the supplied context. Update service check/module contracts and focused fixtures, including backend tests which manually construct the old guard.

Required call map:

| Caller                                                   | Observation                                                                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| typed add/update                                         | Complete proposed owner typed set; reader itself seeds old and new endpoint components.                                                                                                                      |
| typed remove                                             | Proposed owner set excluding the relationship; old endpoint evidence is still required.                                                                                                                      |
| direct legacy add/remove                                 | Proposed owner legacy set; no foreign legacy endpoints.                                                                                                                                                      |
| runner `applyAll`                                        | Fresh staged graph after each graph-affecting command. Include typed add/update/remove and legacy removal in `GRAPH_AFFECTING_KINDS`; preserve current create/move/duplicate/delete/estimate checks.         |
| ProjectService `depReach` patch                          | Proposed reach for that project only, before write, inside `createAdmittedWrites`.                                                                                                                           |
| StepService removal                                      | Incident step references first; proposed owner steps/estimates with the step removed.                                                                                                                        |
| step creation/order changes                              | Their resulting workflow changes must run in an admitted transaction and receive before-write overrides or a staged post-write check before commit. Renaming alone has no graph topology effect.             |
| move/create/hand-down/duplicate/delete/estimate-presence | Validate endpoint shape against projected affected owner trees, then fresh staged graph before transaction decision. A node-to-parent defect is a modeled structural refusal, not a trusted-graph exception. |
| undo/redo                                                | Revalidate referenced endpoints and preconditions before compensation; fresh connected graph after staged compensation, before flip/commit.                                                                  |

The two currently separate route writes in `admitted-write.ts` also need current principal propagation. Change their public wrappers to take the authenticated actor and expected access, pass that caller to `AdmittedWriteTransaction.run`, resolve it inside the transaction, then invoke existing ProjectService/StepService methods with actor ID and **fresh** access. Their narrow read context is bound there. Retain existing service edit/recovery policy and audit ownership; do not turn bare step removal into an audited recovery merely to obtain a graph reader. The reader's read authority and edit admission are separate. Existing project/step hooks may continue their redundant current-DB checks.

Do not silently add a local-only context to import/copy/maintenance callers when they encounter external relationships. Current local imports can receive an explicit local-only context. External import remapping/copy authoring remains task 8, and incident structural hand-down/project deletion remains the remaining part of 4.4. Every caller changed mechanically must either carry a real bound context or visibly refuse external state, never pretend that a reader which cannot understand it is connected-capable.

## 4. Owner-local refresh and replay metadata

In `working-plan.resource.ts` typed add/update/remove/removeAllFor, collect the union of before/after endpoints, filter `endpoint.projectId === retainedProjectId`, deduplicate work-item IDs, and call the existing strict `refreshRows`. Keep its ownership validation. Store writes already bump both actual endpoint projects; do not bump remote rows again and do not copy them into retained rows. Keep `listIncident([owner])` permitted and arbitrary remote requested projects forbidden on the retained store. The separate connected reader supplies closure.

Remote revision preconditions cannot fit the current owner-only `revisionsOf`/`staleness`. Add an explicit additive history field in `service/compensating.ts` (the actual current home of Preconditions):

```ts
interface ExternalRevisionPreconditions {
  readonly expected: readonly ScopedRevision[];
  readonly from: readonly ScopedRevision[];
}
// Preconditions.externalRevisions?: ExternalRevisionPreconditions
// Recording.externalBefore?: readonly ScopedRevision[]
```

Keep the legacy `expected/from: Revisions` maps for owner-local rows and step allowances. Add a helper collecting scoped typed endpoint addresses recursively from both forward and inverse commands, including nested batches. Partition by owner; these addresses are independent of flat `touchedBy`, which currently cannot carry scope. Require exact external coverage for any command whose forward/inverse contains an external relationship. No metadata means legacy only when both directions are local. Validate malformed values, duplicate addresses, unexpected owner-local addresses and missing required coverage as corrupt trusted history. Do not default missing external metadata to empty arrays.

At mutation admission, capture every remote old/new endpoint revision before the first relevant write into `Recording.externalBefore`; at record time read the same complete address union through `readRevisions` for `externalRevisions.expected`. For a collected batch use the earliest before value for each scoped address, and final post-batch revisions. A command introduced after the first command's owner-row snapshot must not disappear from the external before set. Keep owner history and plan event ownership on the successor; these remote revision reads create no remote journal entry and grant no remote authoring rights.

Replay order: current command principal/owner admission; decode payload and exact metadata; partition typed endpoint references from ordinary owner-local mutation references; current evidence on old/new typed endpoints; external revisions; existing local/unit/progress preconditions; apply compensation; resulting graph; flip and rebase; transaction decision. Extend `referencesOf` with a scoped dependency-endpoint collection rather than broadly exempting a foreign work-item ID because it appeared in a typed command. A batch containing both a legitimate remote endpoint and an unrelated foreign patch must still refuse the patch.

Use the checked evidence for remote revision/name comparisons. Current inaccessible/foreign/absent endpoints give concealed access refusal before label-bearing stale details. Revision mismatch is stale replay; preserve existing discard-after-rollback policy. Flip records post-compensation external revisions as expected and previous expected as from. Extend owner-stack neighbor rebasing to exact scoped-address entries, only when neighbor.expected equals the undone entry's external from, exactly as the existing conditional-undo rule. Do not visit another project's journal or blanket-restamp all remotely touched IDs.

Representation transitions local→external→local preserve relationship ID and audit and require both-direction metadata; scoped journal equality includes project identities. This typed-link history integration belongs in the next lane because without it even a positive lower-level transaction is incomplete. Bulk successor deletion, parent hand-down of incident references and project deletion are separate remaining 4.4 work, not implicitly solved by this metadata.

## 5. Honest announcements and dormant production behavior

Do not make `announceTreeNow` catch a connected-read exception, send an empty tree, skip `dirty`, or send an engine-unavailable event for missing connected implementation. Its current success path calls public `tree()` after commit. `commandTransaction` also calls before/after `fanoutCapture`, whose current isolated fast path has no dependency recipients and whose shared path still calls `readChain`. Capture's new `captureConnected` does not make those consumers correct.

Until tasks 5.2/6/8.4 supply actual connected derivation and fanout, production external authoring remains dormant **before the first mutation**. Preserve or add the explicit dormant authoring check at the typed service admission boundary, including direct-service external writes and replay which would create/change an external edge. It must be a real rejecting production capability, with no env flag or optional missing-as-enabled fallback. Use a modeled `external_dependencies_inactive` conflict (409), add it to shared refusal declarations and D3's admission contract, and check it after owner/endpoint authorization but before duplicate/graph/write/history work. Unknown or malformed capability state throws; it is not dormant or enabled by default. Until task 10 exists, composition supplies an explicitly dormant implementation and has no production activation option. The semantic transaction tests may supply an explicit fixture admission for the dormant capability; that proves transaction semantics only and must be named accordingly. The durable participant/activation protocol itself remains task 10.

The next lane's positive transaction tests use the real SQLite source/UoW, real organization/binding revalidator, real connected reader, real retained writer and real journal. Invoke the admitted service graph under `collect`, call `recordCollected`, and settle through the existing UoW. Assert committed rows/revisions/history and no premature announcements. This is an integration test of the admitted mutation, not a fabricated mounted success. Do not replace the production runner's graph, public tree, or fanout with a permissive mock and call that HTTP proof.

If required external state reaches a live consumer before its implementation exists, fail closed explicitly at that consumer boundary; do not drop the edges and return local dates/readiness. No new public connected-success DTO is emitted merely because capture exists. Use existing thrown unsupported/trusted-state failure behavior until the real typed connected projection is implemented. Production dormancy prevents ordinary users from reaching this transitional state. A read-only external capture fixture is valid evidence for capture, not for tree/startable/saved/export consumers.

When the later connected projection lands, finish the standard runner path: before/after fanout includes dependency closure in isolated and shared modes, seeds both old/new topology, records required invalidations transactionally, delivers after settlement, and obtains owner tree/readiness from the real connected projection. Preserve actual calendar-unavailable/engine outcomes and optimizer non-admission. Do not introduce a temporary generic invalidation event just to avoid the missing derivation: that does not make subsequent client reads correct.

## 6. Implementation ownership and proving tests

Wait for the capture worker's final review/integration before editing source/UoW callers. Keep its required `SqliteScopeFactory { createScope(lifetime), createRepairScope() }`, borrowed live/fanout lifetimes and fresh-per-run scope unchanged. This command design needs no extra generic Scope field and no account-store widening. The integration owner owns core command/working-plan/composition files, WorkItemService/DI, graph facade, compensating history, backend bootstrap/mount and shared exports. The pure connected graph foundation should need no semantic change.

Ordered slices for that one owner:

1. Principal/revalidator propagation and modeled whole-request refusals, including directory/undo/prelude and bare project/step route writes. Existing local commands stay green.
2. Registry/parser/binder and required checked endpoint capability; dormant public refusal. Add owner-local refresh and use scoped keys.
3. Inject the real connected guard everywhere, including staged per-command checks and before-write changes. Keep direct scoped calls in the same admitted transaction.
4. Typed-link remote labels, preconditions, flip/rebase and replay. Prove real add/update/remove/representation transitions and undo/redo in admitted SQLite transactions.
5. Add mounted negative admission cases and preserve the explicit mounted-positive/announcement/live/lifecycle activation debts. Record the exact scope in verify.md; do not tick entire 3.2/4.2/4.3/4.4 boxes on narrower evidence.

Required tests and independent R5 faults:

- Queue a human command behind a binding revocation, membership removal/demotion, credential-rule change or context change. Show the current transaction resolver is called before endpoint reads/audit/capture/writes; removing it must change the actual mounted outcome. Include same app with another SQLite connection mutating authority, undo/redo, a step prelude, directory command and direct runner invocation. Missing/malformed trusted authority throws, never legacy.
- Restricted readable predecessor succeeds in the admitted real transaction while its actor cannot edit that predecessor. Foreign and absent endpoints have equal concealed outcomes; wrong-project step, second successor, old-endpoint access loss on update/remove and stable-ID/alias combinations follow the existing contract. Remove each check independently and observe its specific production-path negative, rather than relying on an FK failure to prove admission.
- Capture the bound capability and facade from success/refusal/throw, call after close and during a second UoW, and suspend a read across close. Refuse before the next DB read or returning evidence. Remove scope-close/continuation checks independently.
- Use real graph fixtures for A.design→B.build→A.test, a real reverse node cycle, whole/descendant expansion, distinct tasks closing a remote cycle, and a project with zero owned edges but outgoing incidents. Test each structural caller and new-component/old-component overrides; independently bypass each actual call, not just the pure graph function.
- With nonempty retained owner rows, external add/update/remove must refresh only local IDs and leave accurate local revisions. Removing the partition must fail its real transaction test. Inject a missing required remote revision and show the journal cannot commit or replay from an incomplete set.
- Exercise all representation moves, remote edit conflicts, access loss, exact scoped equality, collected earliest-before/final-after revisions, nested mixed-reference replay, conditional neighboring undo/redo and stale-entry repair after rollback. Remove coverage validation, external revision comparison, scoped equality, replay authorization, graph check and remote rebase equality independently. Distinguish a modeled refusal from a late trusted-state exception.
- For every refusal compare both relationship tables, all old/new endpoint revisions, recovery audit, owner journal/history, event log/sequencer and held announcements. Include a prior successful command then failing command. A failed replay may discard its selected stale entry only through the existing intentional repair policy.
- Mounted production remains dormant. Assert that a valid external request cannot commit and then fail its post-commit tree announcement. Local mounted commands and ordinary isolated/shared source captures keep their existing tests; no scheduling mock establishes external mounted success.

No implementation, behavioral tests, mutations, formatting/typechecking or host gate was run for this ruling. Read-only source/test/design inspection and Git identity/status commands were run. The capture source was actively changing; no claim is made about its final review, tests or merged state. Final mounted positives, connected fanout/live projections, incident lifecycle beyond typed links, transfer/copy/saved consumers, optimization and the semantic activation/deploy barrier remain explicitly unverified.
