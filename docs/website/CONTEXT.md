# PUNI website funnel

The public path from a visitor's software need to a human-reviewed proposal request. This context owns prospect-facing language and request state; it does not define WBS projects or delivery execution.

## Language

**Visitor**:
A person exploring Prosperous Unification's services before identifying themselves.

**Prospect**:
A person shaping a software request who has identified a contact email, but has not become a client.

**Request description**:
The visitor's original words describing the software they need, preserved as entered when they continue into the app.
_Avoid_: Lead prompt, chat seed

**Intake draft**:
A short-lived, browser-claim-scoped request description that can become a manual proposal request or the start of a scoping conversation.
_Avoid_: Anonymous account

**Software request**:
A record of a prospective software project, its brief and proposal status. A browser-bound claim controls its access; there is no prospect account (ADR 0039).
_Avoid_: WBS work item, project

**Scoping conversation**:
A bounded exchange that helps a prospect clarify the problem, users, workflows, constraints and first useful release.
_Avoid_: Delivery agent

**Request brief**:
The editable summary of a software request that can be reviewed apart from any conversation.
_Avoid_: Transcript, specification

**Conversation stage**:
The server-derived point a scoping conversation has reached: clarify, brief, contact, exhausted or handed off. It decides which affordances the app offers; the model never sets it.
_Avoid_: Funnel step, intent state

**Visitor turn**:
One message the visitor sends in a scoping conversation, counting the request description as the first.
_Avoid_: User turn, prompt

**Conversation allowance**:
The set of ceilings a scoping conversation runs under: visitor turns, completion tokens, and spend per conversation, per source and site-wide per UTC day.
_Avoid_: Quota, budget

**Source**:
The pseudonymous, daily-salted hash of the client address behind the gateway, used only to bound how many conversations and how much spend one address may start in a day.
_Avoid_: IP, visitor id

**Concept preview**:
An optional interactive illustration of a possible interface, rendered from constrained components. It makes no claim that the software has been built. Retired with the account path (ADR 0039); no route serves it until it is re-planned on the conversation.
_Avoid_: Prototype delivery

**Proposal request**:
The prospect's explicit submission of a request brief and contact details for human follow-up.
_Avoid_: Contract, order

**Funnel count**:
A per-UTC-day number derived from stored funnel rows: drafts, conversations started, briefs captured, exhausted conversations by reason, proposal requests split into manual and from-chat, and ceiling-settled operations. It is shown on the operator overview and is never a browser event.
_Avoid_: Analytics event, conversion beacon

**Operator inbox**:
The private view in which an authorized PUNI operator reviews proposal requests and their contact status.

**Expired anonymous draft**:
An intake draft whose browser access period ended before it was attached to an account or submitted for a proposal.

**Retention subject**:
An account-owned software request or a standalone manual proposal submission, identified separately for deadline, classification and erasure decisions.
_Avoid_: Software request as a name for every proposal

**Retention deadline**:
The fixed date when a non-client retention subject's content becomes due for removal.
_Avoid_: Session expiry, replay expiry

**Client designation**:
An explicit operator-recorded classification that a retention subject belongs to a contracted client, independent of proposal contact status.
_Avoid_: Closed proposal

**Erasure record**:
A durable record that a retention subject's content was removed, including the identity needed to keep it removed after recovery.
_Avoid_: Deleted backup

**Request window**:
A fixed one-minute count of requests per source, per path or across the site, after which further requests are refused for the rest of the minute.
_Avoid_: Throttle, rate limiter

**Daily cap**:
The most intake drafts or proposal requests one source, one email or the whole site may create in a UTC day.
_Avoid_: Quota

**Login lockout**:
The period during which an operator sign-in is refused for a source or for the account after too many failed attempts.
_Avoid_: Ban

**Browser check**:
A short computation the visitor's browser completes before a conversation's first paid reply, with no interaction and no third party.
_Avoid_: CAPTCHA, Turnstile, proof of work (in visitor-facing text)

**Inference pause**:
The recorded state in which paid replies are refused for everyone until an operator resumes them, opened by the spend threshold or by an operator.
_Avoid_: Kill switch, outage

**Guardrail alert**:
A durable, deduplicated record that a guardrail threshold was crossed, optionally pushed to the operator's webhook.
_Avoid_: Notification, incident
