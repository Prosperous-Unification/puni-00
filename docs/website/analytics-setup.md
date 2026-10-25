# PUNI analytics account setup

This is the concrete setup specification for the owner of the GA4 account. It is not evidence that reports or production tracking are configured. Implementation/payload evidence is in [analytics verification](../../openspec/changes/website-funnel-analytics/verify.md); the event contract and consent policy are in [analytics design](../../openspec/changes/website-funnel-analytics/design.md). Danylo Fedorov is the supplied PUNI contact; GA account ownership/access has not been independently inspected.

## Properties and activation

| Environment | One web stream covers             | Measurement ID      | Current evidence                                                                                   |
| ----------- | --------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| Development | dev.puni.dev and dev.app.puni.dev | `G-R0JM3R4SSV`      | Owner disabled Enhanced measurement; fresh intercepted official-runtime proof passed on 2026-10-25 |
| Production  | puni.dev and app.puni.dev         | Pending owner input | No property/settings/delivery proof                                                                |

Use separate Dev/Production properties and one shared web stream per environment. The app is a website, so it does not need a native Android/iOS stream. [Google account structure](https://support.google.com/analytics/answer/9679158?hl=en) recommends one web stream for a connected web journey.

Before activation, record the selected property, stream, access owner, measurement ID and date. Keep Enhanced measurement off for this launch, including automatic search/form/outbound events. Individual features can be considered later with updated payload tests; the current proof applies to the tested disabled configuration. The original tag attempted search-term and full form-destination collection; all those test requests were intercepted. [Google documents the individual controls and fields](https://support.google.com/analytics/answer/9216061?hl=en).

Verify advertising/Signals/personalization and automatic user-provided-data collection remain off. Do not connect Ads, create remarketing audiences or infer these account settings from the browser's denied ad-consent commands. The proposed event retention is two months; record the actual value and reset-on-new-activity setting before making a notice claim. The proposed reset setting is off. GA retention for event/user-level detail does not delete standard aggregate reports; avoid saying all analytics disappears after two months. [Retention behavior](https://support.google.com/analytics/answer/7667196?hl=en).

Use the shared consent adapter and environment build configuration, not a second unconditional snippet. App build inputs are `VITE_ANALYTICS_ENABLED`, `VITE_ANALYTICS_ENVIRONMENT` and `VITE_ANALYTICS_MEASUREMENT_ID`; production must reject the development ID. Private site/release integration supplies matching configuration. Both environments default off. A property ID alone is not authorization to bypass consent or unresolved release checks.

## Custom definitions and the enquiry event

Create these event-scoped custom dimensions under Admin → Data display → Custom definitions. Names are presentation labels; event parameter spelling must match exactly. Use Google's predefined source/medium/campaign, hostname, page and device dimensions instead of duplicating them. [Custom-dimension setup](https://support.google.com/analytics/answer/14239696?hl=en).

| Display name     | Event parameter   | Meaning                                                       |
| ---------------- | ----------------- | ------------------------------------------------------------- |
| PUNI page        | `page_id`         | Fixed public page catalogue identity                          |
| PUNI article     | `article_id`      | Approved published article identity                           |
| Starting choice  | `starting_choice` | Six service/help choices or typed                             |
| Entry point      | `entry_point`     | Hero, service or article                                      |
| Funnel version   | `funnel_version`  | Version 1 or legacy                                           |
| Scoping question | `question_id`     | Question catalogue identity                                   |
| Answer mode      | `answer_mode`     | Choice, text, mixed or unsure; never answer content           |
| Turn bucket      | `turn_bucket`     | 1, 2–3, 4–6 or 7+                                             |
| Funnel route     | `route`           | Review context on view events; manual/chat on confirmed leads |
| Failure category | `category`        | Fixed operational category, never error prose                 |

Mark the already code-generated `generate_lead` as the initial key event. If it has not arrived yet, register that exact name as an event created **with code**; do not derive another copy from page views or form submission. Select once per event and no default monetary value. An enquiry is neither a qualified lead nor a paid client. [Mark key events](https://support.google.com/analytics/answer/13128484?hl=en), [code-created events](https://support.google.com/analytics/answer/12844695?hl=en), [counting methods](https://support.google.com/analytics/answer/13366706?hl=en).

Keep starts, question answers and email-card views as diagnostics, not additional lead key events. Local deduplication limits repeated confirmation events, but delivery/storage/browser boundaries remain; the saved server request is authoritative. A recovered lead can legitimately lack starting choice. Do not backfill that field from email or request text.

## Three saved analyses

These definitions are ready to configure after property access and representative development collection are available. They have not been created in an account by this work. Start with the last 28 days; use a shorter range when the property contains less history.

| Saved analysis          | Definition                                                                                                                                                                                                                                                                                                  | Decision it supports                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| PUNI acquisition        | Traffic acquisition detail/free-form view using session source/medium, session campaign and landing page; show sessions, engaged sessions and `generate_lead` key events. Compare device category separately.                                                                                               | Which measured traffic sources lead to requests?                                   |
| PUNI request journeys   | Funnel exploration with the separate tabs below, open entry, indirect step following and device-category breakdown.                                                                                                                                                                                         | Where do consenting visitors leave each relevant path?                             |
| PUNI offers and content | Free-form exploration with an intent tab: starting choice as rows, event name as columns, event count/total users as values; include funnel_start, conversation_start and generate_lead. Separate content tab: fixed page/article, event name and device category for page_view/services_view/article_view. | Which offers get interest and confirmed enquiries; which published pages are used? |

For request journeys, use separate tabs rather than forcing optional questions into the universal path:

| Tab               | Ordered event conditions                                                                                                      | Interpretation                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Submission        | email_request_view → generate_lead                                                                                            | The shortest comparable contact-to-confirmation path, including early/direct entry |
| Question-led chat | conversation_start → scoping_question_view → scoping_answer → brief_view → email_request_view → generate_lead with route=chat | Only the question-led route; successful shortcuts are not failures of the product  |
| Manual            | email_request_view with route=manual → generate_lead with route=manual                                                        | Manual review and submission                                                       |

Additional question progression is diagnostic by question ID and answer mode; do not require every catalogue question. Open entry allows a measured journey to start later after consent, but does **not** make intermediate steps optional. GA counts only the specified sequence, and its funnel user count is not a total count of stored requests. [Funnel sequencing](https://support.google.com/analytics/answer/9327974?hl=en-SG).

Start with the saved exploration as the editable source. If a funnel tab is additionally published as a standard report, record which exploration/version it came from: a saved report does not update when the exploration changes. [Saved funnel report behavior](https://support.google.com/analytics/answer/13012015?hl=en).

The campaign catalogue is currently empty. Before promoting a tagged campaign, register its exact bounded source/medium/campaign triple in the canonical contract and validate the real site→intake→app path. Unregistered, repeated and partial UTM values are not forwarded. This setup does not buy ads, publish campaigns or assign commercial value to enquiries.

## Evidence to record before calling reports ready

Use a synthetic development request after the approved integration is deployed and live collection is deliberately enabled. Consent acceptance should produce a bounded journey and exactly one confirmed lead in the expected browser case; denial should still save the same operational request and produce no Google traffic. Withdrawal must stop later dispatch. Verify the real site→API POST→app navigation retains the intended cookie/session context and does not introduce a self-referral. This cross-host deployed proof is separate from the already passing intercepted app test.

Record delivery in Realtime/DebugView, then verify the custom dimensions and saved analyses after processing. A network enqueue/intercept is not proof of ingestion. Custom dimensions can take 24–48 hours after definition and collection to appear, and key-event standard reporting can take up to 24 hours; document collection and processed-report availability separately. [Dimension timing](https://support.google.com/analytics/answer/14239696?hl=en), [key-event timing](https://support.google.com/analytics/answer/13128484?hl=en).

Compare two saved server requests when only one visitor consents: two operational submissions and one measured lead is an expected outcome. Never divide all server leads by only GA visitors and label that a site conversion rate. Analytics describes the consenting measured cohort; qualification, human follow-up and won clients remain separate operator outcomes. Keep missing account access, production ID, unverified settings or unavailable reports explicitly open in the release record.
