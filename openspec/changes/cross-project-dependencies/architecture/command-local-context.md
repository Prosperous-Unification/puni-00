# Owner-bound dependency context for process and local service graphs

Read-only Astra ruling, 2026-10-22, against `/tmp/puni-cross-command-integration` reported HEAD `3363bac03` and actual composition/service callers. This clarifies `architecture/command-admission.md`; its authority, lifetime, endpoint concealment, transaction, dormancy and history requirements remain binding. No repo edits or tests were performed.

## Decision

The proposed explicit local-only factory is correct. There is no existing owner-bound seam hidden in process composition: `compose.ts` builds `servicesOver(source.stores, ...)` before a project/actor exists; the backend compatibility `servicesOver` does the same. WorkItem typed methods receive projectId/actorId only when called. Current Project/Step graph calls carry projectId but not actor, and `findDependencyCycle(projectId)` also lacks actor. A process-wide endpoint reader cannot safely infer the owner from the endpoint being checked.

Keep the admitted `DependencyContext` exact and bound. Add an explicit required source of contexts for service construction; do not weaken `readEndpoint(endpoint)`, install a mutable current owner, add optional dependencies, or manufacture scoped authority from creator admission.

## Minimal concrete port

In the dependency context module use:

```ts
interface DependencyContext {
  readonly graph: DependencyGraphGuard;
  readonly endpoints: DependencyEndpointEvidence;
  /** Throws for wrong owner/actor or expired observation/graph. */
  assertUsable(projectId: string, actorId: string): void;
}

type ServiceDependencyContext =
  | {
      readonly kind: 'bound';
      readonly context: DependencyContext;
    }
  | {
      readonly kind: 'local-only';
      readonly withContext: <T>(
        projectId: string,
        actorId: string,
        act: (context: DependencyContext) => Promise<T>,
      ) => Promise<T>;
    };

function withDependencyContext<T>(
  source: ServiceDependencyContext,
  projectId: string,
  actorId: string,
  act: (context: DependencyContext) => Promise<T>,
): Promise<T>;
```

`assertUsable` is the small necessary addition to the previously sketched context: it checks the captured owner, actor and lifetime without exposing or accepting mutable authority. The existing graph/endpoint methods still perform their own scope checks before DB access and after every awaited boundary; callers cannot bypass expiry by skipping this assertion. It does not grant edit permission.

`withDependencyContext` is the single branch helper, not a service locator or new scheduler/graph abstraction. For `bound`, check `assertUsable(projectId, actorId)`, invoke the callback with the exact context, and check again after await before returning. Never close that admitted context per service method: its command graph/observation owns its lifetime. For `local-only`, delegate to the explicit factory, which creates and finally closes a fresh context for that operation. It must also check the passed owner/actor before entering and after awaiting the callback. There is no default arm; unknown trusted state throws.

Use a required `dependencyContext: ServiceDependencyContext` in `ServicesOverOptions` and in the options/DI contracts of WorkItemService, ProjectService and StepService. Keep the `AdmittedGraphFactory`'s required fourth argument **`DependencyContext`**, as already ruled. That factory installs `{ kind: 'bound', context: dependencies }`; public composition installs an explicit local-only factory. No union or fallback is added to `CommandGraphAuthority`, generic Scope, stores or endpoint addresses.

A directory graph may receive the bound rejecting context already ruled. Since it has no owner, `assertUsable` rejects every project operation; null retention never grants project authority.

## Local-only factory

Provide one composition helper, e.g. `createLocalDependencyContext(stores)`, returning the `kind:'local-only'` source. Name its behavior in JSDoc: this is compatibility for explicitly local operations and grants no connected read/edit authority. It needs only the existing raw local graph/evidence stores, not an organization ID, remote writer, CommandAccess resolver, inferred principal or grant. Existing service owner-edit checks remain mandatory before entering it.

Each `withContext(projectId, actorId, act)` invocation creates a fresh open flag and captures those exact strings. It must not infer either from an endpoint, a returned work item or a preceding operation on the shared service. Services that initially receive a work-item ID derive its owner through their existing authorized `contextFor`/owner checks, then pass that known owner and the actual method actor into this helper. It is legitimate to locate the operation's owned row; it is not legitimate to treat a proposed remote endpoint as the owner.

The local context:

- Reads `typedDependencies.listIncident([projectId])`, not just `listByProject`. It refuses if **either** endpoint of any incident relationship is outside this project, including outgoing links owned by another project and the zero-owned-edge case. Validate returned incident ownership/shape; malformed trusted records throw.
- Rejects a proposed foreign endpoint or graph override before reading that remote project, row, step, name or revision. Updating/removing an existing external link also refuses: local-only is not authority to inspect or erase it. It never relabels a foreign endpoint with the current owner ID.
- Performs the incident check whenever graph/evidence operations are requested, not merely at process construction; repeat around awaited reads before returning evidence. Graph override validation inspects both current incidents and the proposed set so removing the last foreign edge cannot evade the check.
- Uses the existing local graph computation after proving all incidents/proposals local. The local-only adapter is allowed to invoke the existing local implementation behind the graph facade; it must not copy graph expansion or build a disconnected permissive guard inside WorkItemService. Admitted contexts continue to use the actual `ConnectedDependencyGraphReader` over raw admitted stores.
- Returns detached endpoint/revision values only. Every entry and post-await continuation checks the open flag and exact owner; `assertUsable` also checks the actor. Finally closes irreversibly on success, modeled refusal and throw. A retained context fails during any later invocation, including another operation on the same process service. No shared live slot exists.

For a proposed external endpoint, the local endpoint capability returns `{ ok: false, reason: 'forbidden' }` without remote reads/details, and the service preserves its existing forbidden outcome. Unexpected persisted external incident state in a compatibility-only graph throws an explicit unsupported-context error before mutation, not an empty graph or successful local schedule. Do not misreport inability to establish remote authorization as `external_dependencies_inactive`: that production dormant-authoring check remains **after real endpoint authorization** on the admitted path. A local operation cannot mint the authorization needed to reach it.

A callback lifetime is not a transaction. Public legacy direct calls retain their existing atomicity limitations; this change must not claim to make them admitted connected transactions. Check local scope immediately before graph-affecting writes as part of the service operation, and never accept external state on this path. Existing admitted/import transactions use their existing staged stores. Direct scoped calls, including a caller supplying scoped access, still enter the real mapped admitted transaction; they must not select the local factory as a way around current-principal admission. No nested UoW is opened by this factory.

## Service and composition changes

Keep public local typed add/update/remove signatures callable. After the normal project lookup and `EditAdmission` check, enclose their dependency admission, graph checks, before/after endpoint revision work and relevant recording in `withDependencyContext(...)`; pass `context` explicitly into private helpers such as typed refusal/history evidence. Do not assign it to an instance field. The existing collector is not a precedent for mutable authority.

Remove `new DependencyGraphGuard(opts)` from the WorkItemService constructor. Project/Step use their required context source at graph-affecting operation boundaries after the existing owner/actor access checks. Carry the operation's actual actor through graph-check helpers. In particular, change the runner-facing check to `findDependencyCycle(projectId, actorId)` and update the known runner callers; do not fake an actor because its previous signature omitted one. Read-only graph inspection without an actor, if still required by a nonmutation caller, must receive a separately supplied already-bound context rather than borrow a mutation capability.

- `commandTransaction.openCommandGraph`: creates the real context with captured authority and graph/observation lifetime over rawScope, then passes it to the service factory. No local factory here, even for a component that happens to be local.
- Core public/process composition: explicitly installs `createLocalDependencyContext(source.stores)` once as a factory; contexts are created per operation. The factory itself holds no actor/project and grants no authority.
- Backend compatibility `servicesOver`: explicitly supplies the same local-only factory over the stores it was given.
- Local imports/legacy fixtures: explicitly supply that local-only factory over their current staged/raw stores. They must fail on external incidents; do not invent bound admitted contexts merely to reduce fixture updates.
- Direct scoped service route wrappers: use the admitted-write transaction and actual bound services, as already required. `CREATOR_ADMISSION` is not a substitute for that transaction or endpoint authorization.
- `NO_ADMISSION`: owner edit refusal still occurs before the local factory callback and before any write; neither the source kind nor the callback confers permission. Existing Project/Step access policy is preserved, including the separate ordinary/recovery distinction; do not broaden recovery just to obtain context.

Nested service implementation helpers should receive the context from their outer operation. Independent nested public operations may open independent local contexts, but must never reuse the previous operation's closed context. Bound command operations share the exact still-live admitted context until command-graph closure.

## Required focused proofs

1. Same process service performs a local typed operation for A/actor1 then B/actor2 with no mutable installation; both use their own real local endpoint/graph checks. Wrong owner/actor through retained bound context refuses.
2. Local typed add/update/remove remain successful under explicit creator fixture admission; same operations with NO_ADMISSION refuse before factory/evidence access and write nothing.
3. An owner with zero owned relationships but a remote-owned outgoing incident refuses in the local factory. Removing the incident check/listIncident substitution must break the actual service result. Proposed foreign endpoints, and remove/update of existing external links, cannot bypass it.
4. Retained local graph/endpoint capability after success, refusal, throw and during a second operation refuses. Suspend its read across close and verify no evidence escapes. Independently remove entry and post-await lifetime checks.
5. Bound admitted operation uses the real connected reader and original raw transaction scope. A local-only factory must not be called by this path; a scoped direct call cannot silently use it. No creator grant enables a remote read.
6. Preserve local cycle/refusal/history regression tests, Project depReach and Step removal checks. A sequence of private helpers in one operation sees the same bound context, including before/after revision capture. No silent `listByProject` local fast path skips incidents.

This is the minimal source-vs-bound-context distinction needed by the actual process construction order. It does not change user scope, loosen remote authority, or defer the binding architecture's transaction/history/lifetime work. New code, tests and R5 mutations remain implementation work.
