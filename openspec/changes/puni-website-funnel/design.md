## Context

WBS item `060` selects static Astro/Novaform; `060.2` approved PUNI-only branding and 12-month privacy terms; `060.4` puts the request field above the pitch; `080.12` requires intake and chat to survive reload. The latest user choice puts the site in private `puni-pr-00/apps/website/site` under [ADR 0031](../../../docs/adr/0031-public-and-private-monorepos-share-a-portable-project-contract.md). The private repository exists and is empty; the theme archive is available for a later private import. EmDash research is historical.

## Goals / Non-Goals

**Goals:** Ship an anonymous manual proposal funnel without prospect sign-in first, then account-bound chat, then optional concept preview. Keep description and brief durable through reloads in their permitted mode. Make limits legible to the prospect and operator.

**Non-Goals:** The walkthrough HTML is not a backend. AI output has no authority over pricing, dates, contracts, delivery or executable code.

## Decisions

### Source ownership and release slices

Private `puni-pr-00/apps/website/site` owns static Astro landing/blog and licensed Novaform source, mapped from the archive's `src/pages/index.astro`, `src/pages/blog/{index,[slug]}.astro` and `src/pages/services/{index,[slug]}.astro`. `apps/website/fe-01` and `apps/website/be-01` in the public monorepo may start the app/API, with `libs/website/` dependencies, and move at unchanged relative paths under ADR 0031. M1 submits a manual brief anonymously with inference disabled. M2 adds prospect sign-in and chat; M3 adds optional preview. The local walkthrough is an in-memory decision demo only.

### Portable repository contract

The private repository consumes a pinned, versioned governance/toolchain baseline sourced from the public repository, rather than independently maintained config. Both retain `apps/` and `libs/` relative layout, product tags, Nx target names/semantics, Bun/TypeScript and compatible pinned dependencies, OpenSpec, AGENTS and wiki conventions. A project transfer includes its declared local dependency closure, preserves paths and runs the same Nx test/lint/typecheck/build commands in a clean-copy fixture in each permitted direction. Detect collisions and missing dependencies before destination writes. Repository history, credentials and release authorization remain separate. Novaform source is classified private and cannot transfer to public. This follows ADR 0031; no separate implementation of that decision exists yet.

### Handoff and session boundary

The landing form makes a top-level POST to `https://api.puni.dev/intakes`. The API accepts only the exact public Origin, validates the 2,000-character description, applies bounded source admission, stores a 24-hour intake draft, sets an opaque claim in a `Secure`, `HttpOnly`, host-only draft cookie, then redirects to the fixed `app.puni.dev/manual` route. The URL and logs contain no description or claim. An exact `https://app.puni.dev` credentialed draft-resume endpoint returns only the description bound to that browser's claim for the manual UI. M1 permits brief edits through the claim until submission; it requires one contact email after a description exists and exact Origin/CSRF/rate checks on every anonymous write. Submission consumes the claim, returns a minimal opaque receipt and grants no public read by email or receipt. A missing, expired, reused or different-browser claim has an explicit recovery path.

Choosing AI in M2 starts PUNI sign-in from the same draft; the app does not simulate authentication. OAuth uses provider-managed identity with state/PKCE and a fixed callback on the API origin. The API issues an independent host-only `__Host-puni_session`; credentialed app requests use exact CORS origin and CSRF/Origin validation. Successful sign-in atomically attaches the draft to the account; a signed-in prospect bypasses redundant sign-up. Cancelled login leaves the claim for manual submission or sign-in retry within its TTL. The initial text appears as an unsent chat composer draft; no model call occurs until explicit Send. The M1 operator inbox separately requires PUNI operator authentication; anonymous prospect submission never grants operator access.

### Persistence and submission

The API stores account, intake draft, software request, conversation turns, a separately versioned editable request brief, concept preview and proposal submission as distinct records. Draft writes are browser-claim scoped before sign-in and account-owned afterward; operator inbox access uses an explicit operator role. Submission consumes anonymous edit/read authority in a transaction. A bounded replay proof containing claim hash, idempotency key and body hash can return the same opaque receipt after a lost response; a changed body returns 409, and receipt alone grants no read authority. A visitor may submit before any account, chat turn or preview. Statuses are `submitted`, `reviewing`, `contacted`, and `closed`; no outbound owner notification is sent in M1.

### Inference admission and provider policy

OpenRouter is server-only with a dedicated provisioned key, pinned vetted model/provider, ZDR and `data_collection: deny` only after endpoint compatibility is verified. No browser-selected model, tools, URL fetching or automatic ambiguous retry. Pilot tunables: 4,000 characters per later user message, 12 user turns per brief including the initial text, one active call/account, four site-wide, two active briefs/account, 1,024 completion tokens and 30-second server deadline. Preview gets one generation and one revision with a separate output allowance. Before each paid call, atomically reserve a conservative input/output worst-case amount using vetted rates against $0.50/brief (including preview), $1/account/UTC day and $10/site/UTC day; a dedicated OpenRouter key has a $100/month ceiling. These figures are proposed pilot limits, not spend authorization. Show remaining allowance. A missing key, limit or price disables inference visibly. Cancellation, timeout, missing final usage or stream failure retains an unsettled reservation until bounded reconciliation by generation ID; unresolved state blocks further spending. Provider 402/403/429/5xx map to explicit UI states. Usage in the last SSE event, not early text, settles a stream.

### Scope and output boundaries

The scoping policy discusses the business problem, users, workflows, features, integrations, constraints, first release, interface concept and delivery process. Static unrelated or harmful cases receive a bounded refusal/redirect where possible; model refusals still count as paid usage. Prompt text cannot override system policy or request secrets. The app validates generated brief and preview structures before persistence or rendering. Preview accepts typed JSON from a server-owned schema and fixed safe component set only; generated auth is visibly simulated and distinct from PUNI login. No generated HTML, JavaScript, CSS or remote resource request executes.

### Privacy and operations

The approved 12-month period governs descriptions, chat and contact email unless the prospect becomes a client. An abandoned anonymous claim expires after 24 hours; deletion/backup propagation and the client transition need a written operator policy before launch. No raw prompts enter logs or analytics. Event metrics count aggregate funnel transitions without content. Static site and API have separate health, backup/restore and rollback proofs. Current model price, provider privacy capability and post-cancellation cost lookup require evidence before enabling paid inference.

## Risks / Trade-offs

- The theme archive is available, but private `puni-pr-00` is empty. Import, baseline bootstrap, ownership and replacement of demo assets precede a launch build; licensed source stays private. The previous standalone `puni-site` remains unused.
- OpenRouter guardrails and key limits are defense in depth; provider docs do not promise exact concurrent spend caps. Local atomic reservation and unsettled holds are the controlling budget mechanism, with a conservative allowance rather than an exact billed-cost promise.
- Draft-cookie handoff requires the same browser. Expired or lost claims require an explicit re-entry path rather than guessing the description.
- Static Astro avoids a CMS process but needs an authoring and publish review workflow; draft posts never appear in public output.

## Migration Plan

Bootstrap `puni-pr-00` with the pinned common baseline and bidirectional clean-copy proof, then import the private theme there. Launch static site and anonymous manual intake behind their own routes with inference disabled. Operator auth and inbox, additive migrations, backup/restore and rollback proofs are M1 gates. Enable prospect sign-in/chat in M2 only after privacy/provider wording, key provisioning, endpoint compatibility, budget faults and abuse fixtures pass. Enable preview after renderer and isolation proofs. Keep WBS hosts and data untouched.

## Open Questions

- Confirm the provider-as-processor wording in the approved privacy notice before the first paid chat.
- Confirm private `puni-pr-00` deployment contract and DNS ownership; no licensed theme source is copied here.
- Choose a vetted OpenRouter model/provider and verify current price, ZDR, data-collection denial, required parameters and generation reconciliation behavior with tests before spend is enabled.
