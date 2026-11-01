# PUNI conversion funnel options

Draft for discussion, 2026-10-24. The objective is more useful project requests with contact emails from online traffic. Keep the existing landing prompt → chat journey, with suggested answers and optional typing throughout. These are commercial and experience proposals, not approved product behavior or implementation tasks.

**Recommendation:** promise a useful next step, let a visitor start with one click, ask only enough to understand the request, show a short personalized summary, then offer human review by email. Keep an early submission route for visitors already ready to talk. A maximum conversion rate cannot be established in advance: research informs the starting design; PUNI traffic must determine which version works.

Read alongside the [research and its limitations](conversion-research.md) and the [traffic, content and experiment plan](acquisition-experiments.md). The existing [website context](CONTEXT.md) remains the domain glossary.

Conversation and email-handoff direction refined on 2026-10-25. The subsequent [site revamp plan](site-revamp-plan.md) records the accepted pilot cost allowance and initial model configuration, plus implementation workstreams. Response ownership and timing still need to be settled before publishing the offer.

## What exists and what the goal changes

Read-only browser inspection of [dev.puni.dev](https://dev.puni.dev/) on 2026-10-24 confirmed the input prompt and the choices CMS / website, Application, Automation, AI feature, and Not sure yet. Application reveals Mobile / Web / Both without leaving the landing page. Earlier desktop/mobile inspection in this conversation showed the question as muted input text and the large PUNI wordmark as a stronger visual element. The current [journey documentation](README.md) describes the handoff into a scoping conversation and an explicit proposal request.

The commercial gap is that the opening mostly asks visitors to classify software and supply a brief. It does not make the benefit of starting sufficiently concrete. That is a design assessment, not an observed abandonment result: no traffic analytics or conversion baseline was available for this research.

The immediate conversion is an explicit request plus an email address. Reading an answer, starting chat, downloading something, and subscribing to a newsletter are different outcomes. Later sales matter as a quality check, but booking a call or purchasing an audit should not become a new requirement for submitting a request.

## Three funnel options

| Option               | Journey and email timing                                                                                           | Why it might work                                              | Main trade-off                                                                                        | Use                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A. Short request     | Landing choice or text → one or two relevant questions → summary → email and send                                  | Little effort; suited to a visitor looking for someone to help | A generic summary provides little reason to continue; some requests need clarification later          | Recommended starting route for commercial traffic            |
| B. Guided assessment | Landing choice or text → two to four relevant questions → useful next-step recommendation → optional email request | Gives an uncertain visitor clarity before asking for contact   | Longer interaction; can attract people seeking free advice or imply an inspection that never happened | Candidate for educational articles and exploratory traffic   |
| C. Early contact     | Landing choice or text → explain human follow-up → email and send → optional questions                             | Captures a ready buyer before extra questions become friction  | An early email demand can deter cold visitors and produce vague requests                              | Voluntary shortcut; test against A for high-intent campaigns |

**Starting combination:** A by default, C available from the chat as “Send my request now,” and B offered as “Help me work it out.” Do not force visitors to understand these route names. A detailed opening description can go straight to a summary. A vague answer gets a helpful question. This is an inference from usability guidance, not evidence that this combination will beat every alternative.

An email wall before any useful response and a lengthy free consultation are both hypotheses with costs. Neither belongs in the default simply because a vendor calls it a best practice. The evidence review explains why conversational interfaces are not inherently higher-converting.

## The offer before the questions

The initial exchange should sell clarity and access to a person:

> Describe what you want to build or improve. Get a clear starting point, then ask PUNI how we could help.

This is distinct from promising a free technical audit, a quotation generated by AI, or a completed design. A later paid engagement could be a focused review, a first release, a repair, an assistant setup, or a workflow pilot. Selling those engagements is the human follow-up; the website's first job is earning permission for that conversation.

Keep all five proposed services discoverable. For marketing, choose one problem per campaign instead of advertising the whole catalogue. The recommended first campaign is existing AI-built apps because the founder's platform experience supplies relevant evidence; this remains an assumption pending audience selection, not an established best market.

## Landing prompt and first click

Keep “What do you want?” as the main invitation. Make it visible independently of the input so it remains present while typing. A restrained highlight on **want** can express the brand, but it is a lower-priority experiment than the offer and next-step clarity.

Proposed opening:

> **What do you want?**
>
> Build something, improve what you have, or put AI to work. Choose a starting point or describe it in your own words.

Input placeholder: **“I want to…”**

| Suggested answer         | What it covers                                                            |
| ------------------------ | ------------------------------------------------------------------------- |
| Launch an app or website | New software, including the existing CMS/website route                    |
| Improve my app           | Finish, fix, stabilize, launch, or scale an existing product              |
| Build something similar  | An application inspired by a reference, adapted to the visitor's needs    |
| Get an AI assistant      | Personal assistance with information, tasks, research, and follow-through |
| Automate my work         | Business workflow improvements                                            |
| Help me choose           | Visitors who can describe a difficulty but not a service                  |

Under the choices: **“AI-guided questions. Human follow-up when you request it.”** Add a small, genuine proof link nearby, such as “See a problem we've worked through.” Keep the atmospheric visual identity, but let the opening action remain readable and prominent on mobile.

Six choices preserve the five service intentions plus uncertainty. Six is not a research-established optimum. Test the labels and grouping with buyers; shorten or reorganize if they cannot find themselves.

Choosing an answer opens chat with that choice already recorded as the visitor's first message. A typed opening does the same. Never make someone repeat the landing answer or click Send again after intentionally choosing a single answer. A campaign may make a relevant option prominent; it must not claim the visitor selected it before they did.

## Chat interaction rules

- Ask one plain-language question at a time. Offer a small set of recognizable answers, “Not sure,” and “Something else” with a visible text composer. Suggested answers are not preselected commitments.
- A visitor can complete the scoping questions using choices alone. Email is the only necessary typed contact field. Free text can replace or add nuance to a choice.
- Allow editing earlier answers. Single-answer choices advance on click; where multiple answers genuinely matter, say “Choose any” and provide Continue.
- Reuse supplied information. Do not ask about platform, stage, or outcome if the opening already answered it. Acknowledge the concrete answer briefly rather than adding praise after every click.
- Ask a question only if its answer changes the summary, recommended next step, or human follow-up. Avoid collecting technology stacks, revenue, telephone numbers, or company size out of habit.
- Use visible stages such as “Your goal → A few details → Your request.” Do not display a countdown or “two minutes” until the actual journey supports that claim. Offer submission before exhaustion, not only after all possible questions.
- Label AI guidance honestly. Show human identity and relevant proof. Do not claim that the assistant has inspected an app or confirmed feasibility from selected answers.

These choices apply recognition, branching, and user control guidance from the [evidence review](conversion-research.md). Answer options also prime responses; neutral wording and the ability to reject the list matter.

## How the conversation earns the email request

The intended progression is: “They understand my situation; their judgment is useful; a human next step would help.” Live LLM interaction is a hypothesis for earning that confidence, not proof of credibility or a guaranteed conversion improvement.

Before the default email invitation, aim to demonstrate three things:

1. **Understanding:** reflect the visitor's particular problem and intended outcome accurately, including corrections.
2. **Competence:** contribute a relevant observation or sensible starting point. Restating answers alone demonstrates attention but gives little evidence of judgment.
3. **A worthwhile next step:** explain what a person at PUNI will do with the request and why their response could help.

Use the pattern **understand the answer → contribute something useful → ask the next necessary question**. This is a conversational principle, not a compulsory three-sentence response after every click. Sometimes the most useful response is a single clarifier; sometimes the visitor has already supplied enough to show the brief and offer human review.

Answer the visitor's own questions before returning to scoping. If they describe both the blocker and the desired outcome, skip the planned outcome question. Invite references when they would clarify the request, and retain what the visitor says matters about them. Remember corrections, allow disagreement, and keep proceeding, editing, or stopping easy.

Speak plainly and specifically. Avoid repeated praise, generic reassurance, manufactured urgency, and diagnoses unsupported by inspection. A recommendation can identify a useful inspection focus without claiming to know the cause. Identify the assistant as AI helping prepare a request for a person; do not impersonate that person or imply their review has happened.

SPIN can guide attention to situation, problem, consequences, and desired value, but those are not mandatory stages. Do not make a prospect repeat a consequence they already explained or amplify their pain to force a sale. Its use here is a design adaptation of the [flexible framework](https://www.huthwaiteinternational.com/spin-methodology), not evidence that an AI version will convert better.

**Stopping condition:** enough understanding to propose a useful human next step. Do not exhaust the question graph or enforce a fixed number of exchanges. The question counts in the funnel options are starting hypotheses. Ready buyers can submit earlier; explorers can continue without email. Do not repeatedly reopen the email invitation after they decline.

### Quality before token optimization

Preserve the exchanges where reasoning matters: interpreting ambiguity, responding to a concrete detail or concern, and proposing a useful next step with an accurate handoff. Brief, thoughtful responses can do this; long paraphrases add reading effort and token cost without necessarily adding trust. An overly rigid, terse questionnaire can also feel inattentive.

Choose the desired conversation first, then reduce cost while checking that these behaviors survive. The [implementation design](../../openspec/changes/conversion-scoping/design.md#cost-and-quality-acceptance) owns the subsequent model, token-limit and architecture choices. Evaluate meaningful engagement and usable requests through to paid work, rather than treating longer chats or cheaper turns as success by themselves. The [research review](conversion-research.md) records why conversational interfaces and human-AI guidance do not establish a sales uplift for PUNI.

## Question bank

This is a menu of questions, not a script every visitor must complete. The first landing choice supplies the broad situation. Use one question to understand the main task or problem, then one to identify the desired outcome. Add a clarifier only where it makes the request meaningfully more useful.

Every row also supports **Not sure / Something else / type your answer**. The first column is already known from the landing page.

| Starting choice          | First relevant question                           | Suggested answers                                                                                                  | Useful next question and answers                                                                                                                          |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch an app or website | What should it help people do?                    | Buy or book; manage work; learn or connect; present a business; explore an idea                                    | What do you already have? Idea only; written outline; designs; working prototype                                                                          |
| Improve my app           | What is holding it back?                          | Recurring bugs; unfinished feature; launch uncertainty; slow or unreliable; difficult to change                    | What would you like to make possible next? Invite first users; accept payments; serve existing users reliably; handle growth; release changes confidently |
| Build something similar  | What would you change about the existing product? | Different audience; simpler experience; workflow tailored to us; more control over it; still exploring             | Who is it for? My own use; my team; customers; a wider market. Offer an optional reference link, but allow “I'll share it later”                          |
| Get an AI assistant      | Where would help be most useful?                  | Email and calendar; research and writing; tasks and follow-ups; finding information; coordinating tools            | How much should it do? Prepare suggestions for me; act after I approve; handle agreed routine tasks. These express preferences, not promised capabilities |
| Automate my work         | Which work keeps repeating?                       | Moving information between tools; customer inquiries; documents and reporting; scheduling and follow-up; approvals | What would improve most if this worked better? Less time spent; fewer mistakes; faster response; room for more work; clearer visibility                   |
| Help me choose           | What brought you here?                            | A business idea; an app problem; repetitive work; curiosity about AI                                               | Route to the appropriate question above. For curiosity, offer examples to explore and an optional request, without inventing a project                    |

Optional clarifiers, chosen for relevance:

- Existing app: **“Which part needs attention?”** Sign-in; payments; core customer task; deployment; several parts. Optional description or URL.
- New software: **“Who needs it first?”** Me; my team; customers; a community.
- Workflow: **“What happens today?”** Copy and paste; spreadsheets; email chains; several disconnected tools; a process we have not defined yet.
- Impact, when the visitor has not explained it: **“What does this get in the way of?”** Launching; serving customers; finishing daily work; growing; nothing urgent.

This is a restrained SPIN adaptation: situation and problem first, impact when useful, then the desired benefit. Do not ask every SPIN category mechanically. “Nothing urgent” must be a valid answer. Never manufacture lost revenue, dramatize consequences, or use “How much money are you wasting?” as a default. Huthwaite's sales framework does not establish an optimal website question order; see the [source review](conversion-research.md).

## Optional references across the service paths

Ask for references where they help explain the desired outcome, including examples of what to build or borrow and articles describing an approach. Keep this as a visible optional invitation near the outcome question, with another opportunity in the request summary. Do not add a mandatory reference turn to every conversation or repeat the invitation when the visitor already supplied useful references.

| Starting point          | Reference invitation                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| New app or website      | Are there apps, websites, or articles you’d like to take inspiration from?   |
| Improve my app          | Can you share your app or an example of how you’d like it to work?           |
| Build something similar | Which app should we use as a reference, and what should we borrow or change? |
| Personal AI assistant   | Have you seen an assistant, demo, or article that shows what you want?       |
| Workflow improvement    | Any articles, walkthroughs, or examples of the workflow you have in mind?    |
| Help me choose          | Seen an app, article, or video that helps explain what you’re looking for?   |

Allow multiple links, product names, article titles, or descriptions of screenshots and examples. Ask in the same field what matters about each reference: the look, behavior, feature, or approach, and what to change or avoid. A visitor should not need a public link or a polished explanation to continue. Offer **“I’ll share it later”** and **“No references yet.”**

Keep references and the visitor’s explanation with the request for human review. Preserve edits to the brief when adding references later. A supplied link is not evidence that its contents were opened, understood, or validated. The [local conversation map](prototypes/conversation-map.html) records references as text; it does not fetch links or upload images.

## A complete example with clicks and typing

**Landing:** visitor clicks **Improve my app**.

**Chat:** “What is holding it back?”

Choices: **Things break / Unfinished features / Not ready to launch / Slow or unreliable / Something else**. The composer remains visible: “Or tell us in your own words.”

**Visitor:** clicks **Things break**.

**Chat:** “What broke most recently?”

Choices: **Sign-in / Payments / A core feature / Several things / Not sure**. Typing remains optional.

**Visitor:** types “Checkout stopped working after I changed login. I want to start charging customers.”

**Chat:** “I’d start by checking the full journey from signing in to completing payment. That gives the first repair a clear target: a customer can successfully pay. We’d need to inspect the app to understand the cause. Is that the milestone you want help reaching?”

Choices: **Yes, get payments working / There’s a bigger problem / Let me explain**.

The visitor already supplied the outcome, so the assistant skips “What would you like to make possible next?” It offers a concrete focus, acknowledges what remains unknown, and lets the visitor correct that focus.

**Visitor:** clicks **Yes, get payments working**.

**Chat shows an editable request:**

> You want customers to be able to pay reliably. Checkout stopped working after a sign-in change. A useful starting point would be to reproduce that failure and review the sign-in-to-payment journey before agreeing the repair scope.
>
> This is based on what you've told us; we haven't inspected the app.

**Choices:** **Ask PUNI to help / Change this / Keep exploring**.

With clicks only, ask about the desired outcome if it remains unknown. For example, **Things break → Payments → Accept payments** can produce: “You report problems with payments and want customers to be able to pay reliably. A useful starting point is to review the payment journey; the specific failure still needs clarifying.” It must not invent a preceding sign-in change. Human follow-up can resolve that uncertainty.

## Email request and submission

Recommended default: show the summary before asking for email. The value is already visible; the email enables human review rather than unlocking a hidden answer.

> **Want a person at PUNI to review this?**
>
> Leave your email and send this brief. We’ll reply with our recommended starting point and any questions we need to clarify.
>
> **Email**
>
> **Send my request**

Small explanation: **“We’ll use your email to respond to this request. See our privacy notice.”** Optional name. An app URL or reference can be supplied now or later. Avoid mandatory telephone, account creation, calendar booking, company fields, or invented budget bands. A public starting price could be tested later if the service and economics are actually defined.

Submission explicitly sends the visible request and contact details; merely providing an email inside chat does not submit it. If a visitor wants an emailed copy only, distinguish that from asking for help and report it separately. Newsletter signup is a separate, optional choice, never bundled into the request.

After submission, show the request summary, destination email, and how to correct it. Offer optional details or a call as a subsequent step. Publish a response-time promise only when someone owns and can meet it. The confirmation should say what happens next even without a timing claim.

An early-contact alternative should use the same explanation and summary, just with fewer questions. It should not feel like a surprise contact wall. If the visitor declines email, let them keep the summary and continue exploring without repeated prompts.

## What the visitor receives in each branch

| Branch               | Immediate useful output                                                     | Reason to request human help                               |
| -------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| New app or website   | A small first-use case, intended users, and unresolved choices              | Agree the first deliverable and whether PUNI can build it  |
| Existing app         | The stated blocker, desired milestone, and a sensible inspection focus      | Examine the actual app and scope the repair or improvement |
| Similar application  | The reference idea, intended differences, and first useful workflow         | Assess the adapted scope rather than promise a full clone  |
| Personal assistant   | First task, tools mentioned, and preferred level of approval                | Work out an appropriate setup and boundaries               |
| Workflow improvement | Current repetitive task, desired improvement, and a possible pilot boundary | Inspect the real process and choose a measurable pilot     |

These outputs should be short enough to read immediately. An elaborate generated roadmap, technical architecture, fabricated readiness score, or speculative price creates more claims to trust without making the contact decision easier.

## Trust and follow-up

Show a real person, a relevant example from PUNI's work, and the limits of the initial guidance. Own-platform demonstrations are legitimate evidence when labeled as such; they are not client testimonials. Keep a human-contact shortcut visible to visitors who dislike AI interaction.

The first human reply should reference the request, answer what it can, and propose one next step. For example: “You want to restore checkout before taking payments. I’d start by reviewing that journey. Can you share a demo link, or would a short screen-share be easier?” Adapt that to what was actually submitted. Do not send a generic sales sequence that ignores the conversation or forces the prospect to restate everything.

The recommended initial offer depends on a person actually reviewing each relevant request and replying with specific judgment. Decide who owns that review, what coverage they can sustain, and how requests outside PUNI's scope receive an honest response. No named reviewer or response deadline is committed here. This operational promise is part of the conversion experience, not a detail to leave until after collecting emails.

The [acquisition plan](acquisition-experiments.md) defines channel hypotheses, metrics, email-timing experiments, and the first content series. The initial decisions are campaign audience, the promise PUNI can fulfill in its first response, and the bounded acquisition experiment—not another round of technical design.
