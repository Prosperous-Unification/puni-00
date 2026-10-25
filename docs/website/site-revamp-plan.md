# PUNI site revamp plan

Planning release, 2026-10-25. Goal: turn relevant online traffic into useful human-review requests, with an attentive questionnaire, controlled AI spend and credible evidence of who is doing the work. This document coordinates the release; the linked OpenSpec tasks own implementation details. Nothing here claims the new flow is deployed.

Execution authorization: the user requested autonomous launch preparation on 2026-10-25. About and the first blog post are user-owned and excluded from agent implementation; their drafts and publication are not blockers for the technical launch candidate. Existing content remains intact, and no empty or invented content is published.

## The visitor experience

1. Recognize their situation in “What do you want?”, the six starting choices or a service description.
2. Enter the app with that intent already supplied. Answer with choices, typing or both.
3. Receive useful, specific judgment and an editable brief. Share references optionally.
4. Ask a person at PUNI to review it by explicitly submitting the brief and email, or continue exploring without email.
5. Receive a human response that addresses the actual request and proposes a starting point.

The [conversation plan](conversion-funnel-options.md) owns the question bank, examples and email offer. The [UI brief](landing-ui-brief.md) owns visual direction. The [interactive map](prototypes/conversation-map.html) is a discussion aid, not code to ship.

## Page structure and trust

Recommended homepage order:

| Section                     | Job                                        | Release content                                                                         |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Hero                        | Let the visitor begin immediately          | Existing “What do you want?” direction, prompt, six choices, clear AI/human explanation |
| Small proof link            | Offer evidence without delaying the prompt | Link to one real demonstration or article from PUNI's own work                          |
| Services                    | Explain what PUNI can help with            | Five offers, one outcome-led sentence/example each, matching CTA                        |
| How it works                | Make the next step predictable             | Describe the situation → review a starting point → ask for human help                   |
| About                       | Show who takes responsibility              | Short personal introduction, relevant experience, actual person/contact and proof link  |
| Latest article              | Demonstrate judgment                       | One substantial first post, readable without email                                      |
| Final invitation and footer | Offer a clear next action and transparency | Same prompt/Help me choose route, contact, Privacy and Privacy choices                  |

Keep the hero small enough that the prompt remains the obvious action. Services, About and the article are supporting evidence, not competing forms. A long animated landing page is not a release requirement. A restrained shine on “want” follows the UI brief and reduced-motion preferences.

Trust comes from a recognizable person, a specific demonstration, honest limitations, a clear process, working links and a useful response. Do not invent clients, logos, years of experience, team size, success rates or testimonials. Label platform examples as PUNI's own project. A polished visual treatment supports this evidence but cannot substitute for it.

## Services

The release includes all five offers, using the labels and draft descriptions in the [conversion design](../../openspec/changes/conversion-scoping/design.md#conversion-and-service-copy):

- Launch an app or website.
- Improve an existing app, including an AI-built app.
- Build something similar, adapted to the client's needs.
- Set up a personal AI assistant.
- Automate workflows with AI.

Every service CTA enters its matching conversation. Help me choose remains an exploration route. Lead the first campaign and first proof article toward existing-app reliability, while preserving the full service range on the site.

## About direction

**Recommendation: a short founder-led section on the homepage first**, with a fuller About page only if there is enough useful material. The user has been asked whether they prefer founder-led, studio-led or minimal presentation; until answered, this is a proposed direction, not approved personal copy.

Content to prepare:

- Public name and a real portrait, if comfortable. A name and direct introduction can work without a portrait; do not use an invented person or synthetic team image.
- Two or three sentences about why PUNI exists and the kinds of projects the founder wants to help with.
- A concrete account of the current work: building an AI-assisted software delivery platform and learning how to make changes verifiable. Present ongoing work as ongoing.
- A simple explanation of responsibility: who reads the brief, discusses scope and follows through. Publish only after that person agrees to the role.
- One proof link and a direct contact option. No fabricated biography or unsupported qualification.

Possible positioning lines to choose between:

| Direction                             | Candidate line                                          | Trade-off                                                                                     |
| ------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Personal accountability — recommended | “A person you can work with.”                           | Clear and approachable; needs a real introduction below it                                    |
| Craft and evidence                    | “From an AI-built prototype to software you can trust.” | Relevant to existing apps, but needs concrete proof and must not imply guaranteed reliability |
| Broad studio                          | “Software and AI, built around the work you need done.” | Covers all offers, but says less about why this particular studio deserves trust              |

Suggested body direction, to edit into the founder's own voice: explain the move from generating code to checking real user journeys and recovering from failed changes; connect that experience to the visitor's problem. Keep the platform's internal terminology out of the introduction. The first article can carry technical detail for readers who want it.

## First blog post

Start from the delivery-platform experience, with a buyer's problem as the subject. The existing [editorial plan](acquisition-experiments.md#start-the-blog-from-the-delivery-platform) owns the detailed outline, sources and distribution approach.

| Candidate                                                                             | Why it earns trust                                                           | Evidence needed                                                                                          | Recommendation                                                    |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| “My checks passed while my app was broken”                                            | Shows a specific mistake, the consequence and a stronger verification method | The recorded typecheck-compiling-nothing incident; safe before/after reproduction or historical evidence | First post: strongest existing evidence                           |
| “Your AI-built app works in a demo. What should you check before inviting customers?” | Directly helps the likely first buyer                                        | A real customer-journey walkthrough and concrete observations                                            | Second post, or first if the initial campaign is launch readiness |
| “What I'm learning while building an AI software delivery platform”                   | Explains the person and motivation                                           | Selected working examples, explicit unfinished parts                                                     | Founder update supporting About; weaker first commercial article  |

For the recommended first post, explain what the green check was assumed to prove, what it actually checked, the observable failure, and how deliberately introducing a fault changed the verification. Close with one action the reader can take and a contextual Improve my app invitation. Avoid implying that the incident means all AI-built apps are broken or that PUNI's platform is finished.

Editorial acceptance: named author, date, inspectable evidence, a plain-language customer consequence, accurate distinction between historical incident and fresh demonstration, no customer secrets, one useful takeaway, and a functioning contextual CTA. Drafting and preparing assets are reversible; publication is a separate release action.

## Implementation workstreams

| Workstream                      | Deliverable                                                                                                           | Implementation owner document                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A. Conversion and cost          | Landing intent, six selectable paths, adaptive AI, references, editable brief, email handoff, existing spend controls | [Conversion tasks](../../openspec/changes/conversion-scoping/tasks.md)      |
| B. Services and privacy         | Five matching offers, truthful AI/storage/follow-up copy and verified processor/retention facts                       | Conversion tasks, group 4                                                   |
| C. Traffic and funnel analytics | Consented GA4, safe events, confirmed lead measurement, cross-host continuity and reports                             | [Analytics tasks](../../openspec/changes/website-funnel-analytics/tasks.md) |
| D. Trust content (user-owned)   | About draft, proof asset and first blog draft supplied by the user                                                    | Content checklist below                                                     |

Build order:

1. Shared contracts and compatibility; Improve my app end to end against a deterministic provider fixture.
2. All other routes, optional references, corrections and human-review submission.
3. Services/hero integration in the private site; About and first-post preparation remain with the user. Consent adapter can be built against a fake sink while this proceeds.
4. Verified privacy copy, bounded live AI evaluation and actual operator receipt.
5. Analytics property/report setup, consent and leakage tests, final mobile/accessibility review, deploy/rollback checks.
6. Pilot release and review after the first 100–200 conversations; only then adjust questions, model choice or budgets from observed outcomes.

No calendar delivery date is asserted. Execution findings and checks are recorded in each change’s verify.md; the original planning verification below remains historical.

## Cost policy

Use the accepted $0.01/session planning allowance with the existing $0.15 conversation ceiling, eight visitor turns, source/day limits, $10 site/day ceiling and automatic pause. Keep a dedicated provider-key cap at or below $100/month. The existing website key was verified at $50/month during execution; preserve that stricter cap and verify the deployment uses it. Exact reservations, provider usage, cancellation and retries are covered in the [conversion design](../../openspec/changes/conversion-scoping/design.md#cost-and-quality-acceptance). Preserve manual conversion when AI is unavailable or capped.

Model charges are separate from hosting, acquisition and human follow-up. The low estimate is not a reason to omit abuse controls, and the ceiling is not the expected spend per visitor. Review quality, truncated replies, actual mean/high-percentile session costs and usable requests together before optimizing.

## Analytics choice and reports

**Recommendation: GA4 for acquisition and measured funnel behavior, existing server records for submissions and spend.** Start with opt-in basic blocking, no remarketing or content capture, and separate production/development configuration. The user supplied development measurement ID `G-R0JM3R4SSV`; it must be loaded through the consented adapter described in the [analytics design](../../openspec/changes/website-funnel-analytics/design.md). Account settings and collected events still require verification.

The first reports should answer:

- Which channels and campaigns bring visitors who submit requests?
- Which of the six starting choices is used, and which paths lose measured visitors?
- Do visitors see a brief but stop at the email invitation?
- Do service/About/article readers continue into a relevant conversation?
- How many actual requests and how much inference spend does the server record?

GA4 lead events are neither qualified prospects nor paid clients. Review submitted requests manually for fit and record subsequent sales outcomes through the existing operator/commercial process; a later CRM or offline conversion integration is separate. Declining consent and ad blockers mean GA4 represents an incomplete cohort. Do not mix its visitor denominator with all server submissions to manufacture a conversion rate.

## Content and release checklist

- [ ] Confirm About direction, public identity and any portrait; write one concise introduction in the founder's voice and get factual review.
- [ ] Select one platform proof asset, verify what it demonstrates, and label it as PUNI's own work.
- [ ] Draft the first article from the editorial plan; review the historical claim against its source and collect any fresh demonstration before describing it as observed.
- [ ] Inspect the actual private hero/services/About/blog/privacy components; record their paths, then integrate the approved content and shared CTAs. Check desktop, keyboard, mobile and reduced motion.
- [x] Assign human-review ownership: Danylo Fedorov, dany@puni.dev, supplied by the user on 2026-10-25. No response-time promise is approved.
- [ ] Resolve business/contact/processor/retention facts for privacy and record the evidence; do not treat an expiry timestamp as verified deletion.
- [ ] Complete the two implementation task lists and their failure-proof/gate records; verify one real preview request reaches the operator with its edited brief and references intact.
- [ ] Confirm analytics choice and property ownership, test denied/accepted/revoked states and sanitized events, and configure the three reports.
- [ ] Perform an end-to-end release review: campaign/article/service → chat → useful brief → explicit request → human reply process. Keep AI and analytics independently disableable.

## Decisions to discuss as evidence arrives

About positioning is a preference: founder-led is the recommendation, with studio-led and minimal alternatives above. The first article choice depends on the initial audience: the failed-check incident has the strongest evidence today, while a launch-readiness walkthrough is more directly commercial once demonstrated. GA4 is suitable for the proposed channel strategy; a simpler first-party analytics product is an alternative if consent/UI or reporting complexity proves disproportionate. No provider swap is needed before trying the documented Luna configuration with the revised conversation corpus.

These choices stay visible for review. Implementation details with a clear existing pattern are resolved in the linked designs rather than turned into repeated approval questions.

## Planning verification

On 2026-10-25, both new changes passed individual strict OpenSpec validation. `openspec validate --all --json` reported 290 items passed, zero failed. Formatting and scoped document link/path/selector checks passed for the new planning artifacts. These checks establish document structure, not implemented behavior.

The schema explicitly creates `verify.md` after implementation, so those artifacts remain absent and all implementation tasks remain unchecked. Runtime tests, the host gate, paid-provider evaluation, private-site integration and GA4 account checks were not run for this documentation-only planning work. No deployment, tag activation, email or post publication occurred.
