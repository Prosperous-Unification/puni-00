## Context

The user requested traffic and funnel analytics and suggested Google Analytics. GA4 is the recommended initial provider, not an already configured account. The [acquisition plan](../../../docs/website/acquisition-experiments.md) defines commercial outcomes. `funnel-store.ts` and the operator panel already count persisted requests and spend, but not page visits or acquisition sources.

This work is separately reviewable from [conversion scoping](../conversion-scoping/design.md). It deliberately supersedes the no-analytics-script clause in [website operations](../puni-website-funnel/specs/website-operations/spec.md) and the corresponding statement in the [runtime runbook](../../../docs/website/build-runtime.md) only when this change activates. Do not silently edit that historical/current policy before implementation.

## Goals / Non-Goals

**Goals:** show which sources bring visitors, which starting choices they use, where measured visitors leave, and which campaigns result in confirmed enquiries. Keep request content private to the operational system and retain accurate server submission/spend counts.

**Non-Goals:** ad buying, remarketing, audience profiling, session replay, CRM, offline conversion upload or measuring every nonconsenting visitor. First-party attribution/qualification records can be a later change; this release does not pretend GA4 identifies paid clients.

## Decisions

The boundary and alternatives are in [proposed ADR 0058](../../../docs/adr/0058-consented-traffic-analytics-stays-separate-from-request-content.md).

### Consent and integration

Use GA4 through a small first-party adapter, with a directly installed Google tag after acceptance; a Tag Manager container is unnecessary for this initial fixed event set. Default analytics and advertising consent to denied. Basic blocking means no Google script/request before acceptance, rather than relying on advanced-mode cookieless pings. Keep `ad_storage`, `ad_user_data` and `ad_personalization` denied; do not activate Signals, ad personalization, enhanced conversions or automatic user-provided data collection.

Expose Accept analytics, Reject analytics and a persistent Privacy choices link. Use one versioned preference across the production site and app; it is not authentication. Keep draft/operator cookies host-only. Proposed preference lifetime: six months, a product choice requiring consistency with the final notice. Malformed, expired or new-policy preferences mean no consent; do not infer acceptance. On withdrawal stop dispatch, clear adapter queues, disable collection and clear the configured analytics cookies without deleting functional request storage. Exercise withdrawal on already loaded pages, not only on the next visit.

Represent optional measurement explicitly as disabled, denied, loading, ready or unavailable. An allowed third-party loading/network failure returns unavailable and never blocks the main product. Invalid first-party event definitions are programming errors. Do not silently accept an unknown event or parameter to keep tracking running.

### Event contract

Use `libs/website/domain/contracts/src/analytics.ts` for event unions/validators and reviewed page/campaign metadata. The framework-neutral browser implementation lives in `libs/website/adapters/analytics` (`website-analytics`, `@website/analytics`); both React and private Astro consume it. `apps/website/fe-01/src/analytics.ts` only validates Vite environment inputs and delegates to this shared controller. DOM/vendor APIs stay in the adapter. Explicit project-transfer dependencies are app → analytics/contracts and analytics → contracts. The private service snapshot and release guards must include this fifth public tree during private integration, including fleet’s historical four-tree check. No chat objects are passed to the adapter. All IDs below come from bounded catalogues, never user text.

| Event                   | Trigger                                                         | Allowed contextual fields                                          |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `page_view`             | Consented public page/app route becomes visible                 | Canonical path, fixed title, sanitized referrer                    |
| `services_view`         | Services section first becomes visible on that page             | Fixed page ID                                                      |
| `about_view`            | About section first becomes visible                             | Fixed page ID                                                      |
| `article_view`          | Blog article is displayed                                       | Published article ID                                               |
| `funnel_start`          | Intake creation succeeds after the hero, service or article CTA | Starting choice or typed, entry point, funnel version              |
| `conversation_start`    | First operation is admitted                                     | Starting choice, funnel version                                    |
| `scoping_question_view` | A committed question becomes visible                            | Question ID, turn bucket, starting choice                          |
| `scoping_answer`        | Server accepts a response                                       | Question ID, answer mode: choice/text/mixed/unsure; no answer text |
| `brief_view`            | Editable brief becomes visible                                  | Early/default/exhausted/manual route, starting choice              |
| `email_request_view`    | Email submission card becomes visible                           | Same route and starting choice                                     |
| `generate_lead`         | Server confirms explicit proposal submission                    | Starting choice, manual/chat route, funnel version                 |
| `funnel_failure`        | A visible modeled failure affects progress                      | Fixed category: unavailable/limit/network/validation/conflict      |

Use the existing return/refresh points to identify admission, not optimistic clicks. The event specification permits neither receipt IDs nor provider errors. Emit no invented monetary value for an enquiry. Mark only `generate_lead` as the initial key event; a chat start is not a lead. Qualification and paid-client measurements remain operator work until deliberately implemented.

Disable enhanced measurement initially, particularly form interactions, outbound clicks and site-search collection. Disable automatic page views and send exactly one sanitized page view per supported navigation after consent. Configure safe page location/title/referrer before the Google tag initializes, because automatic session events can otherwise carry the real URL. App routes use fixed names; exclude `/operator` and any authenticated/private operational view entirely.

Strip query strings and fragments from measurement locations. Register campaign identifiers in a bounded campaign catalogue; map approved source/medium/campaign values into GA configuration before the first hit. Reject unknown or free-text UTM values for custom attribution rather than forwarding them. Referrers expose only the validated origin, never path/query. Do not use dynamic page titles containing a brief or reference. Test the entire outbound Google payload, including automatic parameters, not just the custom object.

### Session continuity and duplicates

Use one production GA4 property and web stream for `puni.dev` and `app.puni.dev`, with compatible parent-domain measurement cookies and the same tag ID. These are subdomains; first verify shared cookies/session behavior rather than adding a bespoke identity handoff. Test the actual POST to the API and fixed redirect, not only a link between two static pages. Do not widen the functional claim cookie or put identifiers in the request URL to repair analytics. If Google linker configuration is necessary, configure only approved hosts and verify it survives the real navigation without carrying request content.

Both environments have analytics off by default. The owner-supplied `G-R0JM3R4SSV` is development-only for `dev.puni.dev` and `dev.app.puni.dev`; production uses `puni.dev` and `app.puni.dev` and still needs its own approved property/ID. Both pairs share cookie ancestor `puni.dev`, so the fixed cookie prefixes are `puni_dev` and `puni_prod`, with preference names `puni_dev_consent_v1` and `puni_prod_consent_v1`. The adapter refuses mismatched ID, host, cookie domain, prefix or preference name. Real browser tags are unavailable on localhost; intercepted browser fixtures can use the approved HTTPS development hosts. Functional cookies remain host-only.

Deduplicate page navigation and receipt confirmation in the adapter; consumers deduplicate observed functional transitions independently of consent or loading notifications. `dispatch` drops interactions unless ready and accepts no lead-event bypass. `dispatchLead(receipt, event)` keeps a local sent marker keyed by the opaque receipt in consented session storage; never transmit that identifier. Mark after successful vendor enqueue, not confirmed delivery. A same-page in-memory marker also prevents a retry if persisting the marker fails after enqueue. Unknown starting choice may be omitted only for recovered `generate_lead`; never invent `typed` from missing metadata. On a lost API response the recovered receipt can still trigger the first event. Across browser storage deletion or blocked transport GA4 cannot guarantee exactly-once delivery; server totals remain authoritative. Do not use a custom event ID and assume GA4 deduplicates it automatically. Consent granted halfway through a flow starts measurement from that moment, without replaying prior unconsented events.

### Shared controller integration

`createBrowserAnalytics(window, options)` owns one controller per Window and refuses a different configuration on a second call. Its public methods are `getState`, `subscribe`, `accept`, `reject`, `sync`, `navigate`, `dispatch`, `dispatchLead` and terminal `dispose`. Subscribe to render preference state; do not replay milestone effects on notifications. The page owner calls `navigate` after client navigation. Focus, visible-page return, pageshow and every dispatch also reread the cookie. Disposal belongs to the page owner, not each React component effect. There are at most two explicit load attempts per page and a ten-second loader timeout; unavailable loading does not retry on every render or synchronization. New consent may explicitly retry. Withdrawal cancels a pending script, disables the loaded vendor, clears its layer and only that environment’s measurement cookies/lead markers. Async generations and a final preference reread prevent stale loader completion from enabling measurement.

The version-1 preference expires six calendar months after the choice; the cookie expiry uses the same instant. Missing, malformed, expired or unsupported-policy preferences deny measurement. Optional browser storage/security/quota and vendor loading failures are typed unavailable; unexpected first-party exceptions propagate. Submission consumers must not await measurement as a prerequisite for submission.

The approved registry currently covers site `/`, `/services`, `/services/product-discovery`, `/services/software-design`, `/services/software-development`, `/blog`, `/privacy` and the single published article `/blog/a-clearer-first-step-for-software-requests`; app pages are `/` (Build) and `/manual`. Each has its own fixed ID/title. Services/About section views use the containing page ID. Unknown routes, unpublished articles and operator paths disable measurement. The new five-service routes must be registered from approved public content metadata during private integration. No draft About content or article is created for analytics.

The production campaign catalogue is empty. Normal untagged measurement is supported. Adding a campaign requires a reviewed source registration with bounded source/medium/campaign identifiers; unknown, repeated or incomplete UTM triples are not forwarded. Reserved fixture registrations prove mapping only and do not establish commercial approval. The tag receives canonical location, fixed title, origin-only referrer and safe campaign overrides before its initialization commands; raw UTM id/content/term and URL passthrough are disabled. Local fake-sink/DOM tests do not establish actual Google payloads or enhanced-measurement account settings. Those remain activation gates in the next slices.

### Reports and privacy

Create three saved reports: acquisition by source/medium/campaign and landing page; a funnel exploration from page view through start/question/brief/email/lead; and content/service engagement by starting choice and device. Allow direct entrants and early/manual requests as branches rather than requiring every question stage. Report completion among consenting measured journeys separately from total operational submissions. Analytics blocking, late consent and retention create differences; never divide all server leads by only GA4 visitors and call that the site conversion rate.

Initial proposed GA4 event retention: two months, reviewed after the pilot. Record the actual account setting, access owner, production/dev IDs, consent implementation and disabled advertising features. The privacy notice must describe Google processing independently of OpenRouter and PUNI storage. Changing the notice alone does not enable analytics.

Official sources checked 2026-10-25: [Google consent modes](https://developers.google.com/tag-platform/security/concepts/consent-mode) distinguishes basic blocking from advanced pings; [cross-domain measurement](https://support.google.com/analytics/answer/10071811) explains same-tag/cookie settings and self-referrals; [recommended events](https://developers.google.com/analytics/devguides/collection/ga4/reference/events) defines `generate_lead` separately from qualified and converted leads. These establish integration semantics, not PUNI's legal basis or conversion forecasts.

## Risks / Trade-offs

Analytics adds a third-party dependency and an optional-consent decision. The model costs remain in the API and do not depend on GA. First-party aggregate counts alone cannot answer campaign questions; GA4 alone cannot prove actual paid work. The initial combined approach accepts those limits without adding a custom tracking warehouse.

The private site's source and existing consent/UI implementation are unavailable in this checkout. Property ownership, IDs, account processing settings and applicable disclosure facts must be obtained at integration. No paid GA edition or additional analytics service is assumed necessary; verify the selected account's terms before setup.

## Migration Plan

1. Shared event contract and consent adapter with a mocked sink and negative leakage tests; production disabled.
2. App milestone hooks and private landing/blog/services/About hooks; test both with denied, accepted and withdrawn preferences.
3. Configure the owned property, reports, sanitized campaign catalogue and privacy notice. Do a bounded preview smoke in a separate property.
4. Enable on production only after the full consent/navigation/payload checks pass. Rollback removes tag loading while all operational flows continue.

## Open Questions

Development measurement ID is supplied, but production ID, property ownership/access, enhanced-measurement OFF evidence and final retention/disclosure approval remain unverified. Record them before activation. Those inputs do not block implementation against a fake analytics sink.
