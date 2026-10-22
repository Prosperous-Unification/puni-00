# Conditional runtime receiver design

Adopted supplement to [design.md](design.md), prepared on `79f4dcdd97ba2111170558b71965899212171859`. The owning proposal remains the intent. This packet covers S0.05 revision reads, S0.06 conditional commands/acceptance and S0.07 receiver attempt authority; adoption does not complete implementation tasks.

## Boundary and guarantee

Add a conditional runtime channel beside ordinary WBS APIs. Reuse the existing authenticated principal, organization access, project/person/credential checks, command semantics, journal, unit of work and committed fanout. Do not change ordinary UI/operator command behavior. Runtime fences protect callers following this channel, not an authorized actor intentionally bypassing it through the ordinary API. Workers must not hold independent WBS write responsibility in the later coordinator composition.

WBS mints monotonic generations per `(organizationId, projectId, personId)`. This receiver fence is independent of a Dash RunStore owner epoch. Takeover preserves physical claims and execution bindings; it establishes neither worker death nor quiescence. Current authorization is checked before historical acceptance replay. Successful command identities remain permanently payload-bound; refused requests are not recorded as accepted and may be reevaluated.

No auth/API-key/OIDC/MCP-consent/org-limit/compute/provider/activation implementation, cross-project dependency change, CTT change, executor adapter, coordinator or reset/admin tool belongs here. Project resource occupancy uses existing business rules; it is not tenant quota or local execution capacity.

## Shared semantic records

Add framework-free values in `libs/wbs/domain/contracts/src/runtime-command-values.ts`; final HTTP shapes are added only when every operation is implemented. All records below are immutable, versioned and boundary-validated; implementation derives wire types from the final shapes rather than maintaining divergent definitions. Existing identifiers stay opaque nonempty strings; session IDs retain WBS's 1–256-character limit. Numeric counters/generations must be safe integers, never silently coerced or wrapped.

```ts
type RuntimeScope = Readonly<{ organizationId: string; projectId: string; personId: string }>;
type RuntimeAuthority = Readonly<{ ownerId: string; generation: number }>;
type ExecutionIdentity = Readonly<{
  storeId: string;
  runId: string;
  attemptId: string;
  sessionId: string;
}>;
type RuntimeClaim = Readonly<{
  claimId: string;
  workItemId: string;
  stepId: string;
  parentClaimId: string | null;
  execution: ExecutionIdentity;
}>;
type RuntimeBasis = string; // exact wire pattern /^rb1:[0-9a-f]{64}$/
type RuntimeContext = Readonly<{
  projectId: string;
  personId: string;
  actor: AuthenticatedUser;
  access: ResourceAccess;
}>; // existing @wbs/contracts principal and core organization-access type
```

`ExecutionIdentity.runId/attemptId` are local runtime identities; the WBS claim's existing `runId` equals `sessionId`. The receiver binds that opaque session string; it cannot prove a live backend session. WBS numeric business `attemptNumber` and `startAttempt/endAttempt` are unrelated and excluded. A runtime attempt binds one leaf/step; continuation/reattachment preserves the SAME runtime attempt, session and exact claim. A genuinely new execution attempt retains its logical operation but obtains a NEW exact WBS claim, after predecessor quiescence/effect reconciliation and guarded exact release. The immutable old binding is never rebound to the new attempt/session. Takeover does not automatically release a claim. The release/reclaim gap can admit another holder: retry must recheck normal eligibility and a current basis, with no guaranteed continuous reservation. No claim-update API or additional active-binding table is introduced. Binding uniqueness is `(scope, execution.storeId, execution.attemptId)`; the stored run/session/target must also match. `ownerId` is an incarnation label, not a secret or credential.

The application consumes `RuntimeContext`, resolves current project/person authorization again inside its admitted write/read, and derives the actual scope from existing organization authority. **Scope decision:** this v1 channel requires `access.kind === 'scoped'`; legacy access returns typed `runtime_scope_unavailable`. Existing ordinary APIs keep their legacy behavior. No synthetic organization, nullable scope or caller-supplied organization is introduced. If legacy runtime use is required, obtain an agreed organization capability from its owner before implementing that alternative.

## Coherent facts and compact basis

The narrow runtime observation contains the current project revision, every local work item's `{id,parentId,revision,externalRefs}`, and project steps `{id,code,position}`. Reuse existing external-reference and step field semantics; do not add scheduler output or invoke a remote optimizer. Borrowed `projects.findInOrganization`, `workItems.listByProject`, `steps.listByProject` and `claims.listByProject` are available. Startable/export remain existing advisory reads; the receiver still executes current business admission on writes.

`domain/runtime-basis.ts:describeRuntimeBasis` emits exactly UTF-8 JSON of:

```text
["wbs-runtime-basis",1,ledgerId,organizationId,projectId,projectRevision,[[workItemId,revision],...]]
```

Use the complete local row set, sorted by binary/code-unit ID order, with duplicate IDs and malformed trusted revisions rejected. No newline, locale sort, spread-dependent key order or client-defined algorithm. Hash through existing `core/ports/runtime.ts:Digest`; `apps/wbs/be-01/src/runtime/bun-runtime.ts:nodeDigest` is the real UTF-8 SHA-256 adapter. Prefix lowercase hex with `rb1:`. The analogous `digestAddressSpace/describeAddressSpace` pattern is reusable; its narrower `addressRevision` is not this token. No new hashing package or generic JSON engine.

Capture facts and revisions in one admitted unit of work. A new write recomputes the same token in its transaction; mismatch is `runtime_revision_conflict`. The receipt's `basisAfter` is computed from the actual post-write state before commit, not echoed from the request. Returning/replaying a token does not return current authority; a ref replacement uses facts from the matching observation, not stale refs paired with a newly fetched token.

This compresses the complete revision vector, not all business bytes. Project revision does not include work-item satellites; all row revisions and membership are essential. It retains the conservative O(n) capture, up-to-O(n log n) sorting and unrelated-edit conflicts; wire basis overhead is 68 characters. It provides no cross-project, global-directory or authorization snapshot guarantee. Current business/access checks still run. SHA-256 collision resistance is an explicit basis-equality assumption; accepted payload dedup separately compares full canonical request bytes.

## Application and HTTP surface

Application methods accept `RuntimeContext` plus the requests below. Context authentication/access is never reconstructed from request fields. `readRuntimeState`, `acquireRuntimeAuthority`, `claimRuntime`, `writeRuntime` and `lookupRuntimeReceipt` are proposed application names; `claimRuntime/writeRuntime` extend the existing runner's execution path rather than wrapping a second public UoW around it.

| Final route (relative to `/api/projects/:id`) | Request                                                                                     | Success                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET `/runtime-state`                          | `personId` query; optional `expectedLedgerId` for initial discovery versus pinned use       | `schemaVersion:1, ledgerId, scope, basis, facts, authority: uninitialized-or-grant, claims` |
| POST `/runtime-authority`                     | `schemaVersion:1, commandId, personId, expectedLedgerId, ownerId, expectedGeneration:number | null`                                                                                       | Stored authority receipt |
| POST `/runtime-commands`                      | `schemaVersion:1, commandId, personId, expectedLedgerId, authority, expectedBasis, action`  | Stored claim/write receipt                                                                  |
| GET `/runtime-commands/:commandId`            | `personId, expectedLedgerId` query                                                          | Same stored receipt or typed absence                                                        |

`null` expectedGeneration means an explicitly uninitialized scope in a validated ledger. A grant generation starts at 1 and only the receiver increments it. Discovery without a pin cannot establish continuity for an existing intent. State `claims` is inventory for the requested person only, using an explicit `ordinary | runtime` distinction: ordinary rows expose existing claim fields; runtime rows additionally expose their immutable execution binding. No ordinary claim is silently adopted.

Actions are strict discriminated values:

- `claim`: `{kind:'claim',workItemId,stepId,parentClaimId,execution}`. Exactly one leaf/step. Compile to one existing `claimWorkItem` with WBS run=session, optional parent, and existing default assignment/resource behavior. No subtree acquisition or new resource/assignment overrides.
- `write`: `{kind:'write',claim:RuntimeClaim,commands:RuntimePlanCommand[]}`. Nonempty batch within the existing cap. Restricted existing wire commands: same-target step `setProgress`; same-target step `setMeasure` with metric `token_actual`; same-target `patchWorkItem` whose patch contains only `externalRefs`; and exact-person/target-step `releaseWorkItem`, at most once and last. No alternate stepNodeId addressing, arbitrary patches, directory/topology/business-attempt commands. Reuse semantic parsers and refusals.

External refs remain whole-list replacement, protected by the basis and exact live claim. Unknown usage omits setMeasure; it never becomes zero or erases earlier measured values. If later integration needs aggregation across attempts, settle that mapping there rather than changing this receiver's measure semantics.

A receipt has `{schemaVersion:1,ledgerId,scope,commandId,requestDigest,actorId,acceptance}`. The discriminated acceptance is `{kind:'authority',authority}`, `{kind:'claim',authority,claim,basisAfter}`, or `{kind:'write',authority,claim,basisAfter,applied:[{index,kind}]}`. `applied` is the ordered restricted command sequence successfully committed, with no dynamic undo flags or optional claim-ID guessing. Scope supplies the person. Stored canonical request bytes include operation kind, ledger/scope, every authority/precondition field and ordered command content; store them alongside SHA-256 and the exact immutable reply. Normalize object-key order, retain command/external-ref array order and distinguish explicit nullable fields. Strict inputs eliminate ignored extras; no client hash is trusted.

## Admission, replay and refusal order

1. Validate request shape/semantic fields. Resolve current access, project-write permission, person binding and credential pin through existing code; enforce write scope for mutating requests. Ledger discovery/receipt reads require the same scoped project/person permission, not an old receipt as a bearer token.
2. Validate receiver ledger integrity; compare expectedLedgerId when supplied. A valid different ledger yields `runtime_ledger_mismatch` before replay/absence. Trusted corruption throws.
3. Find accepted command ID in the scope. Equal canonical bytes return the original acceptance, even after takeover/release/later progress. Changed bytes or operation kind return `runtime_command_conflict`. Replay never refreshes authority, journal revisions or mutation fanout.
4. New acquisition: CAS expected receiver generation and mint its successor. New claim/write: require exact owner/generation and current basis. Write additionally checks the live claim's ID, target, person, parent, session and immutable runtime binding. A fresh basis with an old claim is still refused. Claim rejects unmanaged alreadyHeld and any prior binding of that runtime attempt. If a same-holder alreadyHeld target is bound to a different runtime attempt, return `runtime_claim_mismatch`; a new attempt cannot reuse or overwrite that binding even when person/session happen to match. Other-holder conflicts retain existing business refusal behavior, subject to the earlier basis check.
5. Apply existing command semantics, journal, compute final response/basis, insert immutable binding if claiming, insert receipt, and update ledger counts before the same commit. Capture existing fanout inside that transaction and deliver after commit. Failures before commit roll back all of these; failure to deliver a reply after commit leaves acceptance recoverable.

Expected new codes: HTTP409 `runtime_generation_conflict`, `runtime_authority_stale`, `runtime_revision_conflict`, `runtime_claim_mismatch`, `runtime_claim_unmanaged`, `runtime_attempt_bound`, `runtime_command_conflict`, `runtime_ledger_mismatch`; HTTP403 `runtime_scope_unavailable`; HTTP404 `runtime_receipt_not_found`; HTTP400 `runtime_command_target_mismatch` and `runtime_command_not_supported`. Preserve declared existing authorization/domain refusals, statuses and holder/resource details. Conflicts identify the failed condition; do not synthesize `blocked/held/done` wire aliases. Unlisted codes, malformed successful replies, missing required capability and malformed trusted records throw. None means executor failure or proven nonacceptance after transport ambiguity.

The conditional-path race between observation and claim may return `runtime_revision_conflict`; an ordinary command can still return `already_claimed`. This explicit scenario change belongs in the owning delta spec.

## Transactional storage and lifecycle

Use `core/ports/runtime-command-store.ts` with SQL-free operations:

- `inspectLedger(): Promise<RuntimeLedger>` validates marker/schema/current integrity; `assertAbsentHistory(): Promise<void>` validates retained counts before authoritative scope/receipt absence.
- `readAuthority(scope): Promise<RuntimeAuthority|null>`; `compareAuthority(scope, expectedGeneration, ownerId): Promise<RuntimeAuthority|null>` (null is CAS mismatch).
- `readBinding(scope, claimId)` and `readAttemptBinding(scope, storeId, attemptId)`, each yielding the exact immutable binding or null; `insertBinding(scope,binding): Promise<void>` throws on a violated already-checked uniqueness invariant.
- `readAcceptance(scope, commandId): Promise<StoredRuntimeAcceptance|null>`; `insertAcceptance(acceptance): Promise<void>` inserts the immutable canonical envelope/reply and updates receipt count, throwing on an unexpected collision.

`RuntimeLedger` is `{schemaVersion:1,ledgerId,authorityCount,bindingCount,receiptCount}`. `StoredRuntimeAcceptance` contains versioned scope/command/canonical request/digest/receipt. Mutating methods update their corresponding count in the same borrowed transaction: new scope +1 authority; takeover +0; new binding +1; new receipt +1. Raw store writes are trusted persistence primitives, not public business acceptance. Their application caller is responsible for guards, exact receipt construction and atomic composition.

Register all four tables/stores with existing memory and SQLite UoWs; add an unused additive migration with down.sql. Authority/bindings/receipts survive release, undo, journal pruning and ordinary project/person deletion; retain scope IDs without cascading deletion. The journal remains undo/redo history, not dedup storage. Non-deleting runtime APIs and immutable rows prevent normal count decreases. No retention TTL.

The migration creates a random ledger ID and zero-count singleton exactly once. Normal source open, read, authority acquisition and recovery do not create or heal missing schema. Explicit setup/migrateOnStartup may apply a genuinely pending migration, then must validate before runtime readiness. Existing-file recovery uses create=false. Current boot constructs the generic source before its optional startup migration: do not insert an unconditional ledger check into that pre-migration constructor. Inspect when opening the runtime capability after explicit migration/readiness and on admitted runtime operations; lower-level source construction must not heal schema. Validate migration record, constrained schema, marker/version/counts and actual row counts at startup. Revalidate after SQLite schema-cookie changes in an admitted operation; missing tables never become empty lists. Before publicly declaring a scope uninitialized or receipt absent, compare retained counts again even if no DDL changed. Full startup/absence audits scan retained tables; do not claim constant cost.

`down.sql` uses the existing named CHECK guard pattern, before any DROP, to require a valid marker, zero counters and zero rows in all three history tables. First accepted authority already makes rollback permanently refuse, even if every claim is later released. Each migration's down statements and deletion of its Drizzle row are atomic in `rollbackAppliedRows`; earlier reversed newer migrations are not automatically restored. No archive-and-delete/reset path is offered. Old application code may run with additive tables retained; old endpoints are not fallback runtime writers.

A missing/malformed table or marker, or an empty recreated record table whose retained count was positive, throws. If an entirely valid new ledger is reconstructed, old pinned clients get ledger mismatch, never inferred fresh scope/receipt absence. Empty unused rollback/re-upgrade is allowed but mints a different ID. Coherent restoration of an older entire database preserving ID and consistent counts, and hostile DBA forgery, remain excluded; no external backup witness is added.

## Recovery and dependencies

Exact command replay uses the old immutable payload/ID. New basis/grant/payload requires a new command ID. A receipt absence read is only “not accepted at this read”; an old request may still be in flight. Recovery first fences the old receiver generation, then checks absence against the same pinned intact ledger. Even then it says nothing about executor effects. Preserve local outcome/outbox until confirmed acceptance; never rerun an effect because HTTP cancelled or returned invalid JSON.

The bridge must pin ledgerId durably before dispatch and persist local-epoch-to-receiver-grant mappings. Current Dash `runs/records.ts:ClaimAuthority` contains claim/person/agentRun/local run/attempt/project/workItem/occurrence, but no ledger pin, receiver owner/generation, basis or explicit WBS step. Its existing RunStore needs a separately reviewed versioned integration extension; this receiver packet must not pretend it already provides that persistence. Task6 proves real HTTP/client semantics and accepts an explicit expected pin; automatic discovery-to-durable-pin/coordinator integration remains prerequisite work before S7a.

The existing organization capability in `ResourceAccess` is used for scoped deployments; legacy access is explicitly refused as specified above. Credential retrieval remains an injected owner-provided capability later; no new credential API is invented. Cross-project revision guarantees remain the other thread's responsibility. Existing full-tree scheduling/solver output is deliberately not pulled into a transaction merely to compute a local basis.

## Placement and evidence

Implementation is ordered in [receiver-tasks.md](receiver-tasks.md); the owning requirements are [wbs-run-bridge](specs/twilight/wbs-run-bridge/spec.md). [ADR 0058](../../../docs/adr/0058-wbs-owns-runtime-fences.md) records receiver scope and retry identity; [ADR 0059](../../../docs/adr/0059-runtime-acceptance-is-permanent.md) records permanent history and rollback. WBS terms live in the root CONTEXT.md; Twilight attempt terminology lives in its own context. Parent integration tasks remain unchecked.

Source precedents: `PlanCommandRunner.execute`, `CommandAdmission`, `commandTransaction`, `UnitOfWork`, `Digest`, `ClaimStore`, `work-item.routes.ts`, `runCommandBatch`, `readStepAddresses`, `runtime/bun-runtime.ts`, `migrate-down.ts`, and existing claim/identity/SQLite race tests. Verification evidence lives in [verify.md](verify.md); design examples are not test evidence.
