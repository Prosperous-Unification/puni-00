# PUNI funnel prototypes

## Conversation map — 2026-10-25

Open [conversation-map.html](conversation-map.html) directly in a browser. This local, throwaway design map covers all six proposed landing starters, their suggested answers, optional detail questions, uncertainty routes, and the shared request-summary/email handoff. It has a scrollable graph, an “Improve my app” focus, a searchable full question list, and a clickable walkthrough with optional typed answers. The guided examples include the short app path, uncertainty, help choosing, and browsing without an email.

Questions from the discussion are distinguished from additional suggestions. Connections are candidate routing, not an approved or deployed AI policy. Typed answers are preserved but not interpreted; a labeled routing question stands in for AI. Everything stays in memory. There are no external dependencies, network requests, AI calls, browser storage, or real submissions. Use fictional contact details. The diagram is a conversation-review aid, not a landing-page visual mockup.

Sources: [funnel options](../conversion-funnel-options.md) and [UI brief](../landing-ui-brief.md). This artifact is pending review; no routing verdict has been folded into production.

The optional reference step is offered across new apps/websites, app improvements, similar products, assistants, and workflows, with contextual wording and another entry from the summary. It accepts multiple links or names and notes about what to borrow, change, or avoid. “I’ll share it later” and “No references yet” preserve the click-only path. The “App → share references” example opens that step. No links are fetched and no images are uploaded.

Browser review on 2026-10-25: Chrome opened the file directly; all 25 question/end-state nodes were reachable with no overlapping graph cards. Seven walkthroughs covered the six starters and app uncertainty. Typed openings, text plus a starter, optional details, back navigation, guided examples, browsing without email, a fictional-email completion, and catalog search were exercised. The walkthrough had no page overflow at 390 px. No page errors or HTTP requests were observed. These are prototype checks, not production AI or conversion evidence.

Reference expansion review on 2026-10-25: all five service branches showed their contextual reference prompt. Multiple references, text entered before taking the optional reference route, and an edited summary survived into the request; editing from the email step preserved them too. Both skip choices and Back worked. Graph cards did not overlap, the reference screen fit at 390 px, and no page errors or HTTP requests were observed.

## Historical funnel walkthrough — 2026-09

> **Superseded 2026-10-11 by the anonymous Build ([ADR 0039](../../adr/0039-anonymous-paid-chat-bound-to-the-browser-claim.md)); kept as the 2026-09 design artifact.** Its sign-in, cancelled sign-in and twelve-turn steps no longer exist. The reviewed journey is the [walkthrough](../walkthrough.md).

Open [funnel.html](funnel.html) directly in a browser. There is no install step, server, network request, browser storage, account, AI call, or real submission. Use fictional ideas and no personal information.

This throwaway prototype asks whether the sequence **landing prompt → early simulated sign-in → limited scripted chat → editable brief → optional fixed concept → proposal request** feels coherent. A separate manual proposal path skips sign-in and AI. The manual route, cancelled sign-in, twelve-turn limit, and unavailable AI route are included as guided scenarios. The expandable state panel shows what changed after each action.

The questions are scripted. The concept is a fixed task/project app example and is not generated from the visitor's idea. The blog cards are draft topic examples, not published stories or customer claims. The proposal confirmation explicitly says that nothing was sent.

The intended product and technical contracts remain in the website OpenSpec change. This file is only a local conversation aid; its visual treatment and state transitions are not production implementation or validation.
