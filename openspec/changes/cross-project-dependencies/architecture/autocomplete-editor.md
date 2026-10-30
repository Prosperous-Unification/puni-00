# Dependency autocomplete and editor integration decision

Read-only Astra ruling, 2026-10-22. Inspected `/tmp/puni-cross-autocomplete` at reported base `427d34c41`, `/tmp/puni-dependency-autocomplete-report.md`, actual picker/editor/runtime callers, shared lookup shapes, design D8, tasks 9.1/9.2, cross-project delta and ui-core/ui-saas design guidance. The two existing token edits are not reviewed as completed 9.1. No source, Git or WBS edits and no tests were run for this ruling.

## Scope and ownership

**Authorize the frontend worker to implement the real 9.1 flow through its necessary 9.2-listed seams.** The task's reference-set file list is stale: those controls manage teams/tags/services/types, not dependencies. Do not add dependency authority to that directory vocabulary to satisfy a pathname list.

One frontend worker owns the following bounded vertical slice, with its tests:

- `depends-input.ts`, `dep-picker.ts`, new dependency choice/lookup hook and shared options view under `components/wbs`.
- `use-plan-dependencies.ts`, `plan-columns/depends.tsx`, `plan-cards.tsx`, `typed-dependency-editor.tsx`, `plan-live.ts`, the explicit dependency portions of row-readings/memo contracts, `wbs-table.tsx` and `use-plan-read.ts` needed to deliver the service.
- A small `modules/dependency-lookup/{contract,dependency-lookup.feature}.ts` feature with tests; required lookup composition in `modules/project/{contract,composition}.ts`, `runtime/{session-runtime,project-runtime}.ts` and their fixtures.
- Frontend `lib/wbs-api.ts` for exact endpoint input typing/serialization and preservation of existing step-code metadata; `modules/plan-feed/delivered-plan-store.ts` step equality and focused tests. Existing PlanCommands binding continues to forward arguments unchanged.

Reuse existing table/popover/sheet primitives and styles. Shared reference-set chip presentation helpers may remain imports; their directory kind union is not widened. Project settings, optimizer certificate/calendar UI, general Gantt presentation and persisted remote label transport are later 9.2 work unless root assigns their actual producer contract. This is a dependency order, not removal of those requirements from the feature.

Backend/shared contracts and core command changes remain exclusively the command worker's. Root supplies the final endpoint contract into this frontend lane; no casts against an old contract or hidden schema widening. A frontend package compile/test boundary cannot prove a remote command is enabled in production.

## Runtime injection: feature service, not raw HTTP in a cell

Keep the established ProjectRuntime rule: delivery sees a feature service, never ProjectApi/ProjectAddressApi, credentials, ResourceScope or an ad-hoc global fetch.

Add a required `dependencyLookupFor({ projectId, isCurrent })` factory to `ProjectServices`. It creates an `OpenedDependencyLookup { lookup: DependencyLookup; close(): void }`. Project runtime owns/disposes it with its existing DI disposal pattern and publishes required `dependencyLookup: DependencyLookup`. Opening the service makes no request. Table/phone use this same instance. Update exact exported-surface tests and explicit fixtures; no optional missing-as-disabled service or implicit empty fake page.

The feature has the following operations; public argument types omit arbitrary response limits, and response bodies derive from existing success/refusal types rather than duplicating wire schemas:

```ts
interface DependencyLookup {
  discoverProjects(
    query: string,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<ProjectDiscoveryReply>;
  searchEndpoints(
    projectId: string,
    query: string,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<EndpointSearchReply>;
  resolveReference(
    projectId: string,
    reference: string,
    revision: string,
    signal?: AbortSignal,
  ): Promise<ReferenceResolutionReply>;
}
```

These feature replies retain the existing operation's successful body and typed refusal, plus explicit cancellation/transport/boundary failure. The feature maps HTTP-specific representation/headers away; it does not collapse refusal/invalid-response into empty success. Its private repository port is existing `ProjectAddressApi`. Every request uses `limit:'25'`; continuation is a deliberate More action, never an automatic unbounded scan. A retained service after withdrawal/close sends nothing and returns cancellation; pending requests are aborted on close and their late answers cannot publish. Unrecognized trusted states throw, rather than become no-match. Retain the shared client's current organization-refusal behavior.

Construct `httpProjectAddressApi(identity.credential, resourceScope)` once alongside the session's existing project client with the **same** ResourceScope and credential. Add the usual injectable `addressClientFor` composition seam, defaulting to that actual wrapper, to `SessionOwnerDependencies`. The existing optional composition defaults are not an optional runtime lookup capability. Pass the private port into project composition: `projectServicesOver(client, savedPlanRoutes, addressRoutes)` and `projectSourceOver(client, addressRoutes, streamDeps?, savedPlanRoutes?)` are the preferred required-port signatures. Update callers. Do not add these operations to broad ProjectApi just to avoid the explicit second read-only port, and never construct an unscoped client in a hook.

The feature owns runtime lifetime/aborts. The React hook owns active token/project/query generation, debounce, option selection and view state. These are different scopes; both guards are required. The hook passes its own AbortSignal and ignores every answer whose captured identity no longer equals the current view query, even if the transport ignored abort.

## One scoped endpoint model across picker, Customize and authoring

Use existing domain `ScopedDependencyEndpoint` as the internal selected coordinate:

- whole: `{ projectId, scope:'whole', workItemId }`
- node/descendant-step: `{ projectId, scope, workItemId, stepId }`

No remote coordinate is reduced to `predecessorId:string`. An endpoint key is a collision-safe tuple serialization of `[projectId, workItemId, scope, stepId-or-null]`; labels, abbreviation and number never identify the selection. A whole work item and its node are distinct options; equal labels in different projects remain distinct.

Use a discriminated choice model:

```ts
type DependencySelection =
  | { kind: 'local'; endpoint: ScopedDependencyEndpoint }
  | {
      kind: 'remote';
      endpoint: ScopedDependencyEndpoint;
      project: AddressProject;
      addressRevision: string;
      candidate: AddressCandidate;
    };

type DependencyOption =
  | { kind: 'project'; key: string; project: AddressProject }
  | {
      kind: 'endpoint';
      key: string;
      selection: DependencySelection;
      label: string;
      detail: string;
      refusal?: LocalPickerRefusal;
    };
```

`AddressProject`/`AddressCandidate` here are frontend aliases of the actual lookup success body element types. Do not import backend application service types into delivery. Local refusal is the existing local picker vocabulary and is populated only by the real local graph checks. Remote choices are not asserted cycle-free by the local graph; backend admission remains authoritative.

The old `PickerEntry` and `pickerEntries` remain valid as local computation inputs. Map their output to endpoint options, retaining their current refusal/status presentation. `pickDependency`, table callbacks, card callbacks, highlighted keys, in-flight add sets and Customize state take the complete selection/option key. A project option invokes **only** project selection. It must never flow through endpoint authoring or acquire a Customize action.

## Queries, tokens, paging and cancellation

- Search only `currentDependencyToken`. Before explicit scope, empty or non-ASCII-letter-leading tokens never call project discovery. In particular `080` and `010.s1-dev` remain local. Use the backend's actual `/^[A-Za-z]/` gate, not “contains a letter.” Letter-leading input keeps current local title matches visible alongside separately identified project options.
- Debounce ordinary project/candidate text changes by **200 ms**. Cancel timers and requests on token, picker owner row, project choice, runtime, close or unmount. Immediately hide results for incompatible query identity during render; waiting for an effect cleanup leaves a stale-click window.
- A project click stores stable projectId plus observed project metadata, replaces only the active token with `ABBREVIATION.`, clears endpoint/highlight state and requests its candidates. It does not author. The suffix after that selected prefix is sent as candidate q, so empty/numeric suffixes are allowed inside explicit scope. This is not external project discovery on a numeric token.
- Editing the prefix away from the chosen code, deleting it, switching project or replacing the entire token with a local numeric token clears that scope and aborts its work. The same project abbreviation typed later does not silently revive a selection from another token/runtime. Code normalization may use existing domain parsing; do not silently rewrite previous tokens or their separators.
- For a syntactically complete qualified token, project discovery uses its parsed abbreviation, not the full `CODE.010` as a project name search. Use existing `parseWorkItemAddress`; do not split at the last dot.
- Page identity includes runtime, successor/picker owner, mode, selected stable projectId, normalized q and cursor. Every endpoint page additionally has one addressRevision. Refuse/restart on a changed revision or project identity; never merge pages from two revisions. A 409 displays “addresses changed; refresh choices,” and requires re-observation. It does not follow a renamed/reused abbreviation to another project.
- More appends one bounded page after identity validation and tuple-key dedupe. No hidden fetch-all. Loading, successful empty, visible retryable failure, access refusal, stale revision, cancellation and idle/local-only are distinct states. Cancelled/superseded work does not render as an error or an empty successful search. Failure has a retry action for the same current question; no retry of an obsolete question.
- Dropdown openness must depend on an active picker and lookup state, not `entries.length > 0`; otherwise loading/no-match/error are never shown. Keyboard traversal uses current project and endpoint option keys; current local-only Enter/Arrow/Tab/Escape and Customize keyboard behavior remains intact.

## One-click, mixed input and writing

One-click on a local row keeps its existing Whole→Whole FS behavior. One-click on a remote whole/node/descendant candidate preserves **that exact selected predecessor scope** and uses the local successor Whole/FS. A selected node is not silently widened to Whole. A folded-step invocation follows the existing Customize path, with its local successor step preselected.

When a click occurs, only the active token may be replaced with the selected candidate's canonical reference; a reference-null choice remains a stable identity selection and must not invent a textual address. One-click still commits the selected endpoint immediately. On successful commit, clear only the selected active token, leaving the earlier prefix and separator bytes exactly intact; single-token selection therefore retains the old empty-query-for-next-pick behavior. On refusal, retain its draft/selection and show the real refusal. If the user edited the draft while the write was in flight, do not clear the newer token. Customize opens with the full selection without authoring; successful save follows the same active-token clearing rule. Do not reset the whole field before a request, as current `pickDependency` does.

Mixed-list submit retains existing partial-success/one-summary behavior. Tokenize without losing source spans/text. Resolve local whole numbers with the local tree; local step tokens use the current observed local node addresses/identities and never invoke external discovery. Qualified tokens resolve through a selected stable project observation and `resolveReference(projectId, exactToken, addressRevision)`. Preserve resolved identities and token-specific unresolved/ambiguous/stale/refused outcomes, then author each distinct full endpoint against the current successor through existing command methods. Do not route a qualified or local step endpoint through `commands.addDependency(predecessorId)`.

For a pasted qualified token without a selected project, bounded discovery may establish a project only if a complete observed result set has exactly one exact normalized abbreviation match. If continuation remains, uniqueness is not proved: require explicit project selection (or further explicit More pages), even if the first page has one exact match. Multiple exact holders remain separate stable choices. No arbitrary first-result binding. Once a token has a stable project observation, future resolution never follows its abbreviation to a different holder.

Keep existing local number-list behavior, partial success, runtime-current refusal suppression and aggregate refresh/error reporting. Dedupe by endpoint identity (and the complete relation tuple for already-authored relationships), not token text or only workItemId. Do not claim a successful token was undone because a later token failed; do not drop earlier unsubmitted tokens when one option is clicked.

### Authoritative write shape, confirmed by command worker through root

Existing command endpoint arms now accept optional explicit `projectId`. Whole/pair arms allow exactly one of workItemId/workItemRef; explicit projectId forbids workItemRef. Node alias `{scope:'node',stepNodeId,projectId?}` excludes other address fields. Node pair is `{scope:'node',workItemId,stepId,projectId?}`; descendant-step uses the corresponding pair. Omitted projectId binds the successor owner; explicit projectId is preserved and nonblank. The service normalizes to ScopedDependencyEndpoint.

Frontend **remote writes use stable pairs and explicit projectId**. For example:

```ts
commands.addTypedDependency(
  { scope: 'node', projectId: remoteProjectId, workItemId: remoteWorkItemId, stepId: remoteStepId },
  { scope: 'whole', workItemId: localSuccessorId },
  'FS',
);
```

Retain compact local writes for compatibility. Put the single internal-coordinate→write-endpoint conversion beside the frontend dependency authoring helper. Never use workItemRef for a remote choice, reconstruct a remote sn1 address, copy the successor step UUID, or retarget the command route to the predecessor project. Only existing add/update/remove command registry routes write. Production `external_dependencies_inactive` is displayed as a real refusal until later activation; lookup success grants no write authority.

## Customize with independent endpoint choices

Refactor `TypedDependencyEditor` to consume two **endpoint editor models**, not `predecessor:TreeRow`, one shared tree and one shared steps array. Each model contains its own stable project/work-item identity, display heading, selected endpoint key, endpoint choices and completeness/load state. A choice holds `{key, endpoint:ScopedDependencyEndpoint, label, description, step: metadata|null}`. Save emits the chosen scoped coordinates and FS/SS/FF; serialization is outside the editor. Description text uses the selected choice, not `stepOf(localSteps,remoteId)` or `rowOf(localRows,remoteId)`.

A local builder uses the actual local TreeRow/rows/steps/node availability and preserves existing parent/leaf scope and unavailable-local-step behavior. A remote builder uses actual candidate evidence for **the selected project and workItemId**. No fabricated TreeRow, copied local hierarchy, guessed child count or local step list. Whole remote parent wording may say “all descendant work items” when known from descendant-step candidates, but do not invent a count. Reference-null step/descendant choices use the observed work-item/step words, not a fabricated address.

Load remote choices with the existing candidate endpoint: selected stable project, q=observed work-item number, bounded pages, filter by exact workItemId. All options for that row match its number under the current server predicate. The candidate page is a search page, not a complete step catalog. Until cursor exhaustion, keep completeness false unless the existing deterministic grouped iteration has been deliberately proved and tested to establish the selected row's complete block; **prefer cursor exhaustion for the first implementation**. More is explicit and bounded. A stale revision discards the assembled choice set, keeps the intended stable endpoint visible as unavailable, and requests explicit refresh; no automatic rebinding by number. Failed/unavailable choices disable Save without throwing a fake “missing local predecessor.” Available explicit choices can be selected on a partial page, but cannot justify an unambiguous default.

Default priority:

1. Editing an existing endpoint or opening Customize for an explicitly selected remote node/descendant-step preserves that exact endpoint. No preferred-step heuristic overrides an explicit choice.
2. For an ordinary Whole candidate from a normal Depends field, default to Whole.
3. For a remote Whole candidate opened from a folded local step, retain that local successor step and suggest the remote step only when the local code is known/non-null and the **complete observed remote choice set for this work item** contains exactly one matching step code. Use that remote step's own ID/scope. Zero/multiple matches, missing code, partial pages or lookup failure produce an unavailable/unselected predecessor choice and disabled Save until the user explicitly chooses Whole or an offered endpoint. Do not silently fall back to Whole or match by name.

Backend `stepShape` already returns optional `code: string|null`; frontend `stepViewOf` currently discards it. Extend `StepView` with optional code, preserve present string/null exactly, and leave missing code absent (old backend observation). Include code in `sameSteps` equality and any dependency memo keys so code changes invalidate a default. No backend widening or second fetch is needed for the successor code. If a particular existing tree producer omits code, the known required behavior is explicit selection, not deriving a code from the display name.

New-selection Customize can be complete now using lookup observations. Existing persisted remote chips/edit targets need the actual connected read DTO's scoped endpoint and display evidence; task 9.2 must consume that producer when integrated. Do not manufacture that read contract in wbs-api or inject a candidate into local PlanRead rows to claim existing-relationship support. The editor model created here is the reusable consumer seam. Existing local dependencyWords/endpointText stay local or gain an explicitly separate observed-evidence branch; never feed remote IDs through local rowOf. Retain visible unsupported/unavailable state if remote evidence is absent, rather than silently dropping the relation.

## Tests, mutation proofs and completion boundary

Use configured frontend Vitest/Nx, with mounted table/phone/editor tests and actual lookup feature/API wrapper integration. Required focused cases:

- Empty, numeric and `010.s1-dev` send zero project discovery requests; PUNI/puni-c shows project choices alongside local titles after debounce. Project click sends no mutation and selected candidates use stable ID with empty/numeric suffix.
- Pending alphabetic answer followed by 080 cannot render or be clicked; switching selected project/query/runtime, closing and unmount cancel requests. Include a transport that ignores AbortSignal to prove the independent query-generation guard. Session organization replacement must bind the new scope and retire old lookup.
- Loading/no-match/retryable failure/refusal/stale/cancelled are distinct mounted states. Retry targets current question. More uses bounded requests and rejects revision/project mismatch; truncated pages cannot establish a unique project or step-code match.
- Exact mixed separators survive project selection, endpoint click, Customize and failed write; earlier tokens are not sent or discarded merely because a later endpoint was clicked. Mixed batch submit preserves successful local/remote tokens and reports unresolved ones once, with full identity dedupe.
- One-click local remains Whole FS; a remote node sends explicit project/work-item/remote-step identity through real PlanCommands/frontend HTTP serialization. Current backend dormant refusal is rendered, not turned into success. A project option cannot be authored. Keyboard and phone repeated-tap locking use identity keys.
- Customize local regressions: parent descendant scopes, unavailable steps, existing relationship switching, ArrowLeft inside select, Escape/back/focus return, stale/deleted targets and exact duplicate logic.
- Remote Customize never requires a local TreeRow; per-project step IDs differ despite same code; unique code defaults correctly only after completeness, ambiguity/unavailable/uncoded/old code absence forces selection; explicitly selected endpoint wins over heuristic. Ref-null choices stay usable without invented addresses.
- Existing runtime surface, session scoped-client, project composition, step transport/equality, local dependency-list recovery and table memo/focus tests remain green.

R5: remove alphabetic gate, rendered-query identity check, abort/close guard, runtime guard, identity-key project/scope component, page revision check, completeness requirement and remote-step identity selection independently. Observe unwanted real feature calls, stale mounted options or incorrect command payload/default, then restore green and record actual Proof comments. Distinguish redundant protections: disabling abort alone may still be safe because stale filtering works, so its proof must assert cancellation/resource release while stale filtering's proof asserts rendered evidence. Do not claim a still-green mutation proved a guard.

Full 9.1 completion requires the **actual desktop and phone fields** using the installed runtime lookup service, stable selection reaching existing command serialization, Customize preserving identity, all required states and meaningful tests. Two pure token functions or an unused remote options hook are not that completion. A mounted fixture accepting a remote command establishes frontend behavior only; the production boundary remains dormant. Backend scoped command integration is a compile/serialization prerequisite, and persisted remote label/edit, connected live/readiness/calendar/optimization UI and activation remain explicitly required later work.
