# Evidence for the PUNI conversion conversation

Research date: 2026-10-24. Scope: the existing landing prompt → chat → reviewed project request and email journey. This is evidence for brainstorming, not an implementation specification or a prediction of conversion uplift. Applications below are PUNI-specific inferences; the sources did not test puni.dev.

The strongest defensible starting point is a conversation that helps visitors express a useful request with selectable suggestions, optional typing, relevant follow-up questions and a clear human handoff. Success must include request usefulness and reachable contacts. More clicks, messages or captured addresses alone would not establish improvement.

## 1. Recognition supports suggested answers

**Source:** Raluca Budiu, Nielsen Norman Group, [Memory Recognition and Recall in User Interfaces](https://www.nngroup.com/articles/recognition-and-recall/), 2024-01-15. **Evidence type:** usability guidance grounded in cognitive psychology, not a funnel experiment.

**Finding:** Visible cues help people retrieve relevant information; generating an answer without cues generally requires more effort than recognizing a suitable choice.

**PUNI application:** Offer recognizable outcomes or situations beside the input, then contextual suggestions in chat. A visitor might recognize “Automate a repetitive task” before knowing how to describe a software project. Preserve a direct typing path for people who already know what they want.

**Limit:** Describing a novel project also involves deciding and composing, not just remembering. This principle supports reducing effort; it does not establish higher lead conversion or an ideal number of suggestions.

## 2. Suggested answers can change the request

**Source:** Pew Research Center, [Writing Survey Questions](https://www.pewresearch.org/writing-survey-questions/), undated methods page, accessed 2026-10-24. **Evidence type:** first-party survey methodology with examples from Pew research.

**Finding:** In Pew's 2008 election example, 58% selected the economy when explicitly offered, versus 35% who volunteered it without listed answers. Wording, answer categories and question order can change responses.

**PUNI application:** Treat chips as possible answers, not an exhaustive definition of the visitor's needs. Include an understandable route to another answer and, where meaningful, uncertainty. Derive suggestions from real visitor language. Keep the original typed request available when reviewing the generated brief.

**Limit:** Political survey answers are different from purchase intentions. The example demonstrates a measurement risk, not the size of priming in PUNI's funnel. Cleaner-looking structured requests can still be less faithful to the visitor.

## 3. Choice overload has no universal option threshold

**Source:** Scheibehenne, Greifeneder and Todd, [Can There Ever Be Too Many Options? A Meta-Analytic Review of Choice Overload](https://scheibehenne.de/ScheibehenneGreifenederTodd2010.pdf), published 2010-02-10, _Journal of Consumer Research_ 37(3). **Evidence type:** meta-analysis of experiments.

**Finding:** Across 63 conditions from 50 published and unpublished experiments, involving 5,036 participants, the average effect was approximately zero, with substantial variation between studies. The authors could not establish sufficient conditions for overload.

**PUNI application:** Begin with a compact, distinguishable set of suggestions that fits the actual question and mobile layout. Evaluate comprehension, missing choices and selection effort. Do not declare three, four or five options a scientifically optimal count.

**Limit:** The review is historical and covers heterogeneous choices, not modern conversational intake. Its average does not prove that large lists are harmless in a specific interface.

## 4. Every question needs a purpose

**Source:** GOV.UK Service Manual, [Structuring forms](https://www.gov.uk/service-manual/design/form-structure), published 2016-12-07, updated 2018-08-07. **Evidence type:** operational service-design guidance.

**Finding:** GOV.UK recommends documenting why each answer is necessary and how it will be used, branching so users answer only relevant questions, and starting with one decision or question per page before adapting through research.

**PUNI application:** Give each follow-up an explicit job: clarify the problem, desired outcome, affected users or a constraint needed for human assessment. Reuse information already supplied. Stop gathering detail when the request is sufficient for the next human step; allow visitors with a complete request to proceed.

**Limit:** A government transaction has different motivation and obligations from a voluntary sales conversation. One question at a time is a starting design pattern, not justification for a long mandatory interview.

## 5. Reveal complexity when it becomes relevant

**Source:** Jakob Nielsen, Nielsen Norman Group, [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/), 2006-12-03. **Evidence type:** usability guidance and observations from application research.

**Finding:** Progressive disclosure defers specialized features; staged disclosure distributes a task across successive steps. Nielsen distinguishes them and warns that excessive navigation or separating interdependent decisions can harm usability.

**PUNI application:** Keep detailed integration, migration or hosting questions out of the opening prompt. Reveal them only for requests where they matter. Let visitors review and correct connected answers together in the brief.

**Limit:** Turning every field into a chat turn is staged disclosure, not automatically reduced complexity. Extra transitions and repeated confirmations can consume time even when each message looks simple.

## 6. Reduce effort, not merely visible step count

**Source:** Edward Scott, Baymard Institute, [Checkout Optimization: 5 Ways to Minimize Form Fields in Checkout](https://baymard.com/research-articles/checkout-flow-average-form-fields), 2024-06-26. **Evidence type:** first-party commercial usability research and observational benchmarking.

**Finding:** Baymard reports that fields users must consider affect checkout usability more than the number of checkout steps. Its examples show irrelevant fields consuming attention even when unnecessary for the purchase.

**PUNI application:** Audit the work required across the whole conversation. Asking for company size, technical stack, budget and a deadline remains effort even when wrapped in friendly messages. Request each only when it changes qualification or follow-up; preserve legitimate “not decided” answers.

**Limit:** Checkout is not custom-software discovery. The public article does not provide a controlled estimate for removing a PUNI question. Its ecommerce benchmarks must not become claimed lead-conversion gains.

## 7. SPIN is a discovery lens, not a mandatory script

**Source:** Huthwaite International, [The SPIN Methodology](https://www.huthwaiteinternational.com/spin-methodology), undated, accessed 2026-10-24. **Evidence type:** first-party description from the methodology's commercial owner.

**Finding:** SPIN distinguishes situation, problem, implication and need-payoff questions. Huthwaite explicitly describes a flexible framework rather than a rigid sequence, with capability demonstration and an appropriate next commitment also part of the sales process.

**PUNI application:** Use the categories to notice missing understanding: what happens today, what needs improvement, why it matters and what success would look like. Ask about consequences only when useful. Recognize that a new product opportunity may be expressed as an aspiration rather than an existing pain.

**Limit:** The page concerns selling conversations, including major sales; it supplies no controlled test of anonymous AI intake. Its broad superiority claims are vendor claims, not independently verified evidence here. Avoid manufacturing urgency or making visitors complete all four categories.

## 8. Chat can improve one quality measure while costing time

**Source:** Kim, Lee and Gweon, [Comparing Data from Chatbot and Web Surveys: Effects of Platform and Conversational Style on Survey Response Quality](https://soominkim.github.io/project/CHI2019_KIM_Comparing.pdf), CHI 2019, DOI 10.1145/3290605.3300316. **Evidence type:** randomized experiment.

**Finding:** The study assigned 117 Korean adolescents to web/chatbot and formal/casual conditions. Chatbot responses were more differentiated overall; tone moderated that effect. Completion averaged 26:44 for chat versus 17:30 for web. Dropout was 10.2% versus 8.6%, without a significant difference.

**PUNI application:** Evaluate whether adaptive clarification improves the human usefulness of a request enough to justify the interaction. Compare against a credible short intake alternative and monitor time and abandonment alongside request quality.

**Limit:** This was a long, largely scaled survey using Facebook Messenger versus a grid-based web questionnaire, not a modern AI sales assistant. Participants received a reminder; five exceptionally long chatbot sessions were excluded from timing analysis. Differentiation is a quality proxy, not verified truth or sales readiness. The study does not show chat converts better.

## 9. Set expectations and support correction

**Source:** Amershi and colleagues, [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf), CHI 2019, DOI 10.1145/3290605.3300233. **Evidence type:** research-derived guidelines evaluated with practitioners.

**Finding:** Evaluation included 49 design practitioners assessing 20 AI-infused products. Guidelines address understandable capabilities and limitations, relevant information, correction, dismissal and consequences of actions.

**PUNI application:** Explain that the assistant helps prepare a request for human review. Make corrections straightforward, distinguish suggestions from visitor-confirmed facts, and show exactly what submitting will send. State only a follow-up promise the team can meet; retain the existing boundary against AI price or delivery commitments.

**Limit:** The evaluation tested guideline applicability and clarity, not causal improvement in trust, email collection or revenue. Use it to frame design reviews, then observe actual visitors.

## 10. Explain the email exchange; test its timing

**Source:** GOV.UK Design System, [Email addresses](https://design-system.service.gov.uk/patterns/email-addresses/), undated, accessed 2026-10-24. **Evidence type:** service-design guidance.

**Finding:** Explain the address's purpose, support convenient entry and correction, and use confirmation loops only when needed because they interrupt the journey.

**PUNI application:** A sensible initial hypothesis is to show a useful brief, then request an email for the human response when the visitor explicitly submits. Offer an earlier direct-contact path for ready visitors. Describe the actual follow-up; keep a marketing subscription as a separate visitor choice.

**Limit:** This source does not establish whether early or late email capture performs better. Test timing against both reachable emails and useful requests. Delaying capture may lose contacts; early capture may discourage exploration. Neither outcome can be assumed.

## What remains unverified

No reviewed source establishes PUNI's ideal conversation length, email timing, chip count or conversion uplift. No PUNI visitor experiment or production analytics was examined for this review. Recruitment channel and visitor intent should be tracked when evaluating any variant.

The original [The Short Life of Online Sales Leads](https://hbr.org/2011/03/the-short-life-of-online-sales-leads) (March 2011) was not fully accessible. No response-speed multiplier is adopted here. Operationally, measure human follow-up delay and choose a realistic service promise; that is a proposed practice, not a verified numerical conversion claim.
