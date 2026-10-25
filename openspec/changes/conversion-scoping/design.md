## Context

Planning snapshot: 2026-10-25. The [conversation plan](../../../docs/website/conversion-funnel-options.md), [interactive map](../../../docs/website/prototypes/conversation-map.html) and [UI brief](../../../docs/website/landing-ui-brief.md) supply the agreed experience. This change implements that experience; the prototype is not production code.

Source inspection found anonymous claims, a streamed chat, durable operation replay, editable briefs, proposal submission, an operator inbox, retention and spend reservations. The gaps are selectable answers, references, adaptive progression, direct landing initiation, updated services and accurate privacy copy. Existing source is evidence of implementation shape, not proof of a current deployment.

| Existing contract                                              | Replacement for new conversations                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Home description waits for another Send                        | Explicit landing action records start intent; one initial operation resumes in the app          |
| `deriveReplyStage` picks clarify/brief/contact from turn count | Validated scoping reply determines question or brief; server retains lifecycle authority        |
| Plain text plus brief markers                                  | Versioned structured scoping reply; legacy conversations retain their reader                    |
| Proposal card appears by stage                                 | Voluntary early review; default invitation after a brief; editable manual path always available |
| All briefs are captured at a fixed third turn                  | Accepted candidate brief is recorded when useful and never silently overwrites visitor edits    |

These replace the corresponding rules in [Build AI chat harness](../build-ai-chat-harness/design.md) and its explicit-send browser tests for new-version drafts. They do not weaken origin, claim, CSRF, browser-check, retention or accounting rules. The separate [analytics change](../website-funnel-analytics/proposal.md) owns the deliberate revision of the old no-browser-analytics policy.

The licensed Astro site is documented in the private companion but absent from this checkout. Its precise component paths and existing privacy copy were not inspected. The private integration slice requires that checkout and a file map before edits; public contracts and tests can proceed independently.

## Goals / Non-Goals

**Goals:** ship all six starting choices, five matching service descriptions, a useful AI conversation that can be completed with clicks, optional references, and explicit human review. First implement Improve my app end to end, then reuse the same machinery for the other routes.

**Non-Goals:** see [intent](proposal.md). No second chat backend, general agent tools, reference fetching, generated app preview or new CRM. Human replies use the existing operator workflow. Analytics is independently reviewable in its linked change.

## Decisions

### Boundaries and reply contract

Keep the current API, SQLite store, React harness and provider adapter. Add a small shared question catalogue and strict parser under `libs/website/domain/contracts/src/scoping.ts`; server-only reasoning instructions remain in the API. The catalogue contains stable starting-choice, question and answer identifiers plus the reviewed English copy from the question bank. Client and private landing use the same exported identifiers. Do not import the standalone prototype.

One paid call returns one bounded object:

```ts
type ScopingReply = {
  version: 1;
  message: string;
  nextQuestionId: QuestionId | null;
  brief: string | null;
};
```

`QuestionId` is the catalogue union, including uncertainty, route-selection and milestone-confirmation questions. `message` is the contextual explanation; the UI renders the catalogue question once. A question response has a question ID and no brief. A handoff response has a nonempty brief and no question. A reply answering a visitor concern without a new question can have both null; the persistent manual-review shortcut still works. Unknown keys/IDs, contradictory question+brief, blank messages and oversized fields are invalid. Bound message to 1,200 characters and brief to 4,000, within the existing 8,000-character saved brief boundary. Prompt for shorter prose; bounds are safety ceilings, not desired lengths.

Use the pinned endpoint's structured-output support through the installed adapter. Validate the whole response before publishing its question or brief. For version 1, keep the existing cancellable stream transport but buffer the structured payload until validation and durable completion; the UI displays Thinking and Stop, then the complete reply. Do not display raw JSON or fake token streaming. This trades progressive text for a simpler trustworthy boundary; measure completion latency during the paid evaluation. Legacy text streaming remains supported. Do not add an unbounded JSON-repair call; malformed output has an explicit error/manual path and counts against spending.

The model selects relevant questions and writes judgment; the server checks the response, owns actions and budgets, and derives lifecycle state. Semantic correctness is evaluated with scenarios, not claimed from JSON validation. Pass the starting choice, current question/answer context, visitor corrections, references and existing brief as untrusted conversation context. Never promote these to system instructions. The prompt must answer concerns before resuming, avoid already answered questions, and state what still needs inspection. Help me choose offers examples without inventing a project.

### Settlement and compatibility

Migration 013 adds only `conversation_operation.reply_failure`, a nullable enum constrained to
`invalid_scoping_reply` on completed usage-settled rows with null `reply_version`. Completed
means accounting finished, not necessarily a useful AI answer. Known malformed/truncated
output settles actual provider usage, stores fixed manual-path prose and no model content,
and captures no brief or question. GET operation records expose `replyFailure`; live and replay
streams carry `data-reply-failure` with `{code: "invalid_scoping_reply"}` after the fixed prose.
Same-key replay repeats this failure without a paid call; continuation needs a fresh explicit
message or manual review. Missing/invalid usage, including refusals, remains unknown at the
full reservation. Explicit reported zero remains zero. There is no repair call.

Valid envelopes use `reply_version = 1` in the existing reply column. The settlement immediate
transaction also applies the scoping state and saves readable assistant prose plus the catalogue
question text. Old frontends therefore receive readable turns. New controls must use that
existing visible question once, then refresh GET after finish to obtain current question/revision
and candidate; replay renders historical prose without applying an old question. References,
declined email and visitor edits made during inference survive settlement. Only a first candidate
can fill a still-empty canonical brief. The first valid candidate per conversation counts once
in the funnel, independently of the legacy third-turn stage; retention still makes old counts a
lower bound.

Admission returns one transactional context snapshot (history, canonical brief, scoping state,
visitor turn count). Pricing and provider messages use that same snapshot and schema. The
catalogue is privileged static prompt text; visitor material is serialized only as a user message.
The configured completion cap is shared by reservation and provider request, including reasoning.

No new retained text column is introduced. Existing reply/turn erasure and fences cover valid
envelopes and fallback prose; failure metadata survives only as accounting. Additive migration
does not make a pre-scoping backend rollback compatible: release must keep a backend that
understands request payloads, reply versions and failures. This slice performs no rollout.

### Intake, answers and correction

Extend `POST /intakes` with optional `startingChoice` and explicit `startConversation`. Either valid typed text or a starting choice is required. With only a choice, derive the visible description from its reviewed label. With both, preserve typed description unchanged and retain the choice separately. Defaults for absent new fields are a documented legacy protocol, not recovery from malformed values. Existing clients remain manual-start.

The app reads persisted start intent and uses the existing `initial:<draft-id>` identity after solving the browser check. Mount-triggered stream posts carry `initial: true, automatic: true`; absent or false `automatic` preserves explicit Send and Retry. Present flags must be booleans, and automatic follow-ups are invalid. Automatic admission requires version 1 and persisted `startConversation: true`; an unknown/stopped attempt refuses with `automatic_forbidden` before pricing or reservation. Explicit Retry retains the same identity. A completed operation replays; an inflight operation waits; an unknown/stopped operation requires Retry. Neither entering the URL nor a React remount creates a new paid identity. Disable rapid duplicate clicks while submitting. No description, email, claim or reference goes into redirects.

Extend conversation posts with an optional selected `{questionId, answerId, revision}` and optional typed explanation. Resolve answer text on the server and combine it with the explanation without discarding either. Validate catalogue IDs and raw explanations before admission. Match the last committed question/revision inside the reservation write transaction, after same-key replay/body-conflict lookup and before pricing; a stale tab receives a modeled 409 and refreshes. Free text works independently. Suggested answers, including Not sure, advance once. Persist the normalized raw answer (`message` when supplied and selected IDs/revision when supplied) with each versioned follow-up operation. Expose it as `latestOperation.answer` so explicit Retry after remount sends the exact original payload and identity; legacy and initial operations expose null. Missing or malformed non-erased versioned retry state throws. Erased accounting operations expose null only after their message is empty. Correction creates a new visitor turn describing the earlier answer being corrected; it does not delete history or restore allowance. A route change uses the same conversation budget.

### Persistence, references and visitor edits

Add an additive migration with `down.sql` for intake scoping version/start intent/starting choice and a draft-owned scoping record. Persist question ID, revision, optional reference text (up to 4,000 characters), candidate brief and whether the default email invitation was declined. Persist the reply version per operation so replay uses the correct decoder. Use explicit legacy/new version branches; malformed new state throws.

Expose claim/CSRF-protected scoping edits with a revision precondition for references, accepting a candidate brief and declining the email invitation. References are an optional multiline field for names, links and what matters; no URL request or upload happens. They render beside the brief and are included as a clearly labeled section in the final, editable submitted brief, within its 8,000-character limit. An over-limit combination produces an edit request, not truncation. User-approved brief text remains the canonical draft brief; model suggestions never replace it without acceptance. Unsaved edits remain visible when a network write fails or a new reply arrives.

Capture an initial candidate into an empty brief, but retain subsequent candidates separately for explicit acceptance. Adding references does not use a model turn. If the visitor then asks the AI about them, that message uses one ordinary paid turn. The operator receives the exact submitted brief, including the visible references section, through the existing proposal store and inbox. `POST /proposals` accepts optional `version: 1`: this validates the raw nonblank 8,000-character bound and hashes version, email and exact brief bytes. Absent version preserves the legacy trimmed brief and hash so pending submissions still replay after deployment; malformed or unsupported present versions refuse before writes or replay. Browser pending recovery retains version presence or absence exactly. No schema discriminator or additional content column is required. The editor saves canonical body and references separately, and displays their deterministic labelled composition as the final request preview; both contributing fields remain editable. Review renders the composed text as readable prose; Change this opens body/reference editing with an optional reference disclosure, and Review request returns without discarding unsaved changes. Ask PUNI to help reveals contact. During editing/contact, the chat composer is hidden while retaining its draft; an in-flight reply keeps a Stop-only control. Keep exploring restores chat. Automated replies are visibly labelled AI, separately from the human-review offer.

Add nullable `conversation_operation.request_json` through migration 012 with a matching rollback; it contains the exact raw follow-up answer for Retry. Treat it as visitor content in first-content anchors, coverage, account-identity retention, expired-draft cleanup, both erasure paths and journal restore. Existing operation-insert fences apply; updates and operation/conversation ownership cannot move or resurrect the payload. Extend first-content anchors, expiry cleanup, erasure fences and restore handling to every added text field. Erase scoping text with its owning draft/request while retaining only the existing accounting facts needed for ceilings. No migration edits an already applied migration.

### Conversion and service copy

Use the email invitation from the [conversation plan](../../../docs/website/conversion-funnel-options.md#email-request-and-submission). The visible actions are Ask PUNI to help, Change this and Keep exploring. A quieter Send my request now shortcut opens an editable description-based brief at any point; no extra model call is needed. The email field is only part of explicit submission. Declining the default invitation persists; the visitor can reopen it manually.

The service section explains five offers without technical implementation claims:

| Offer                          | Starting description                                                                                | Matching CTA             |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------ |
| Launch an app or website       | Turn an idea into a focused first version people can use: a website, customer app or internal tool. | Launch an app or website |
| Improve an existing app        | Work through bugs, unfinished features, reliability or growth problems in an app you already have.  | Improve my app           |
| Build something similar        | Use an existing product as a reference and shape a version around your audience and workflow.       | Build something similar  |
| Set up a personal AI assistant | Choose useful tasks, connect the relevant tools and decide what needs your approval.                | Get an AI assistant      |
| Automate workflows with AI     | Find a repetitive process and define a focused automation to reduce manual work.                    | Automate my work         |

Use Help me choose once below the group. Copy does not promise full replicas, unrestricted assistant autonomy, measured savings, delivery dates or prices. The UI brief governs premium visual treatment; the same labels and mapping govern hero chips, service CTAs and app entry.

### Privacy copy and release evidence

Audit the actual private site's notice and contextual copy rather than replace it with a generic template. Record a copy-to-behavior checklist covering: responsible business/contact details; purposes and applicable basis supplied by the operator; browser claims and necessary storage; selected answers/chat/reference content; human-review email; OpenRouter and the actual model host; logs and abuse identifiers; retention, backups, rights/contact route; and the linked analytics policy. No invented legal entity, jurisdiction, rights mailbox, automatic deletion promise or geographic processing guarantee.

The public code documents 24-hour anonymous access and 12-month request deadlines, but these do not prove deletion is active. `RETENTION_JOURNAL=disabled` is report-only. Confirm cleanup scheduling, journal/erasure mode and backups before describing deletion. Inspect actual OpenRouter account logging/training controls and endpoint identity. Provider ZDR does not mean PUNI stores no conversation. [OpenRouter's data collection](https://openrouter.ai/docs/guides/privacy/data-collection) and [ZDR scope](https://openrouter.ai/docs/guides/features/zdr) distinguish provider routing, prompt logging and metadata; checked 2026-10-25.

Suggested short copy before starting: “AI-guided questions. Your answers are processed by our AI providers and saved to prepare your request. Privacy.” At submission: “We’ll use your email to respond to this request. Privacy.” Final wording must match verified storage and processing. Reference entry says not to include credentials or confidential access links. Analytics consent is separate; refusing analytics never disables chat or human review.

### Cost and quality acceptance

Retain eight visitor turns, $0.15/conversation, $0.30 and three conversations/source/UTC-day, $10/site/UTC-day, four unsettled site calls, existing 80% pause and 30-second provider deadline. Reserve the exact request and full completion ceiling atomically before inference. Malformed output with known usage is accounted at actual usage; missing usage remains ceiling-settled. Preserve cancellation, refusal, price pinning, no fallback and no automatic SDK retry.

The accepted pilot uses Luna on the documented Azure EU route, low reasoning and a 700-token completion ceiling, subject to current endpoint/account verification. The new structured response must pass evaluation under that ceiling; if it truncates, revise the bounded configuration and recompute reservations together before activation. Never silently truncate the brief or increase the cap only at the provider.

Planning allowance is $0.01/session; the illustrative five-call 15,000-input/2,500-output scenario costs $0.003025 at the 2026-10-25 endpoint rates of $0.11/$0.55 per million tokens. These are not measured averages; exclude hosting, fees, taxes, advertising and follow-up. Verify the dedicated provider key has a monthly limit at or below $100. The existing website key was checked at $50/month; preserve that stricter cap and confirm the deployment uses it. Review actual usage after 100–200 conversations, including aborted attempts and overhead. No live call is needed to implement deterministic tests.

## Risks / Trade-offs

- Structured output can increase latency and completion tokens. Measure under the real endpoint; do not equate valid JSON with a good sales conversation.
- All six routes share one engine; a broad question catalogue can still produce generic answers. Evaluate each service independently, including “not sure” and mixed typed/click input.
- Existing saved chats and a private landing release require versioned compatibility. Roll out the API before sending new intake fields.
- References and corrections can exceed context bounds. Preserve structured current state when trimming transcript; never silently lose the latest correction or visitor-approved brief.
- Human review is part of the offer. Assign ownership and coverage before publishing; no response-time SLA is invented.

## Migration Plan

1. Public shared catalogue, versioned contracts and additive storage, including downgrade and retention tests.
2. Improve my app through a deterministic provider fixture and existing harness; old-version drafts remain usable.
3. All routes, references, edited-brief preservation and human-review copy; quality evaluation.
4. Private landing/services/privacy integration against the new API. Deploy backend before new site/app behavior.
5. Rehearse real-provider cost/latency, pause/disable, rollback and actual operator receipt in preview. Refresh pinned private snapshots through the existing portability workflow; do not independently patch copied public services.
6. Activate analytics only with its separate consent and leakage checks. Release the complete public journey after both workstreams' gates pass.

## Open Questions

Release inputs, not unresolved application design: the private site's actual file map, live endpoint/account eligibility, verified cleanup/backups, responsible-business privacy details, and the named human-review owner. Record these in verify.md when obtained; do not claim they were verified during planning.

### 2026-10-25 pricing amendment from the bounded pilot

The first real scoping pilot exposed a provider charge above the base-token estimate. Automatic cache writes can cost more than plain input, and `provider.max_price` filters base endpoint prices rather than establishing a cache-inclusive spending bound. Keep automatic caching and the prompt unchanged; do not infer a universal multiplier from one endpoint.

Add `OPENROUTER_INPUT_CEILING_USD_PER_MILLION` and `OPENROUTER_OUTPUT_CEILING_USD_PER_MILLION`. Existing input/output rates continue to pin routing base prices and the conservative token estimate. Paid readiness additionally requires finite positive ceilings at least as high as those base rates. Missing ceilings use the existing unconfigured/manual path; malformed configuration throws. Disabled/demo configurations and persisted replay remain supported. Deployments with only the old settings need the two independently verified nonsecret values before admitting new paid work. No environment, key cap or deployment is changed by this amendment.

Price the existing byte-token/framing bound and full completion allowance using the effective ceilings. Validate safe integer token counts and provider `usage.cost`; round the greater of base-rate token cost and provider-reported charge upward to safe integer micro-USD. Missing/malformed charge follows the existing unknown/full-reservation path. Explicit zero is valid; a positive token floor still applies. Keep all existing above-reservation recording, pause and no-clamping behavior. The existing ledger columns are sufficient; no migration or browser contract change.

The evaluator shares these accounting rules, retaining base estimate, reported charge, cache read/write counts and unknown reservations separately. Its host preflight validates exact cache/tier shapes and derives conservative ceilings from every advertised tier, records them, and passes them in memory without modifying the protected runtime file. The observed `azure/eu` metadata requires at least USD0.275 input and USD0.825 output per million when all advertised tiers are covered; these are endpoint-specific activation inputs, never defaults. Missing cache/tier evidence blocks paid evaluation. The original pilot establishes the observation, not corrected accounting or full-corpus acceptance. All further paid work waits for the amended implementation's review.
