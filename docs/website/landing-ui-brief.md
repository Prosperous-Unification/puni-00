# PUNI landing page UI brief

Design handoff, 2026-10-25. Use this brief to explore the landing hero and its transition into chat in a separate session. It captures the direction discussed with the founder; it is not an implemented screen or a claim of proven conversion improvement.

## Intent

PUNI wants useful project requests with email addresses. The landing page earns the first interaction: a visitor can describe what they want or choose a suggested answer, then continue into a short chat. Email collection happens later, when the visitor explicitly asks for human follow-up.

Make the opening feel like access to a thoughtful software studio: calm, confident, personal, and carefully composed. Preserve the recognizable PUNI atmosphere and the central question **“What do you want?”** Make **“want” shine**. Make clicking an answer as obvious and comfortable as typing.

Scope: the opening screen, its responsive and interaction states, and the first chat screen. The full questionnaire and marketing strategy are linked below. Do not turn this into a conventional services catalogue, require a landing-page email, or make a new technical architecture part of the design exercise.

## Starting reference

Inspect [dev.puni.dev](https://dev.puni.dev/) at the beginning of the UI session. The 2026-10-24 inspection showed a dark atmospheric background, moon branding, a rounded prompt input, bracketed category choices, and a large PUNI wordmark below. “Application” revealed Mobile / Web / Both.

The proposed change makes the question visually dominant and replaces technical categories with recognizable intentions. The broad service range remains available; this hero is not restricted to founders with existing apps.

## Proposed content and hierarchy

Use this copy as the first design candidate. Refine line breaks and spacing for the layout; flag substantive wording changes for review.

| Order | Element                 | Copy                                                                        |
| ----- | ----------------------- | --------------------------------------------------------------------------- |
| 1     | Quiet brand eyebrow     | AI can do everything. It doesn’t want anything.                             |
| 2     | Dominant heading        | What do you **want**?                                                       |
| 3     | Short explanation       | Build something new, improve what you have, or put AI to work.              |
| 4     | Input placeholder       | Tell us what you have in mind…                                              |
| 5     | Introduction to choices | Or choose a starting point                                                  |
| 6     | Six selectable answers  | See below                                                                   |
| 7     | Reassurance             | A few questions. A clear starting point. Human follow-up when you’re ready. |
| 8     | Quiet proof link        | See what we’re building                                                     |

Suggested answers, in reading order:

1. **Launch an app or website**
2. **Improve my app**
3. **Build something similar**
4. **Get an AI assistant**
5. **Automate my work**
6. **Help me choose**

A two-column, three-row arrangement is the starting composition. Preserve readable labels and generous targets; use one column where the actual available width requires it. Decorative arrows are optional and must not imply an unrelated external destination.

Use a genuine work example for the proof link. A real founder portrait/name is an alternative supporting element if suitable assets exist. Do not invent testimonials, client logos, performance figures, or a live-human presence.

## Premium visual direction

- **Hierarchy:** the question is the focal point. Navigation stays quiet. The oversized PUNI wordmark can remain lower on the page, with less competition for attention around the prompt.
- **Typography:** generous display type, deliberate line breaks, comfortable reading sizes, and enough space to distinguish the question, input, and answers. Use the existing brand typography as the starting point.
- **Light:** give “want” a warm pearlescent highlight inspired by the moon, with subtle violet or gold tones and restrained glow. The word must remain legible at every point in an animation.
- **Motion:** explore one slow light sweep on arrival, then a settled highlight. Reduced-motion mode uses the static treatment. Avoid continuous pulsing, flashing, cycling placeholders, and theatrical typing delays.
- **Atmosphere:** preserve the dark luminous background but soften and darken the area behind the interaction. Concentrate visual attention around the question. Decorative media should not push the choices out of reach on mobile.
- **Input:** spacious, with a fine visible edge, an obvious send action, comfortable multiline entry, and a subtle focus illumination. Keep the heading and accessible field label independent of the placeholder.
- **Answers:** composed, tactile controls with clear boundaries and hover, focus, and pressed feedback. Existing brackets may remain as a brand detail, provided the controls still look actionable. Readability takes priority over faint decorative text.
- **Density:** every element should earn its place. Avoid competing calls to action, oversized service illustrations, or multiple reassurance paragraphs around the opening interaction.

## Interaction and transition into chat

Typing and choosing are equal entry paths. A single intentional choice opens the chat with that answer already present as the visitor’s opening message. Text submission carries the exact entered description forward. Do not make visitors repeat themselves or press Send again after choosing an answer.

The first chat screen should feel like a continuation of the same experience: consistent typography, background, and controls; clear identification of the AI assistant; one relevant question; selectable answers and an always-available text composer. The chat can ultimately be completed using choices alone until email entry.

Example handoff:

> **You:** Improve my app
>
> **PUNI assistant:** What’s holding it back?
>
> **Things break · Unfinished features · Launch uncertainty · Slow or unreliable · Not sure**
>
> Or tell us in your own words…

No suggested answer is selected on the visitor’s behalf. Let them revise an answer or return to the opening. If they have typed a description and then choose a starter, carry the text along as context rather than silently discarding it.

Show a clear transition/loading state. If opening chat fails, preserve the input or selection and offer an understandable retry. An unavailable AI experience should explain the available manual route. Never simulate a successful handoff or human reply.

## Deliverables for the UI session

Explore two treatments of this same composition: a restrained static highlight and a luminous version with the single light sweep. Keep copy and interaction consistent so the visual choice is reviewable.

Present desktop and mobile views, including a narrow phone. Cover the initial screen, focused input with text, hovered/keyboard-focused choice, handoff/loading, recoverable failure, and first chat question. Show the static reduced-motion treatment. After selecting a direction, record the chosen screen using the repository’s design workflow.

## Review criteria

- A first-time visitor can identify what PUNI offers, what to do, and what follows the first action.
- The question attracts attention before decorative branding, and “want” stands out without impairing reading.
- All six intentions are discoverable. Typing is visibly optional, and a custom answer is visibly supported.
- Desktop and mobile maintain the same hierarchy. Labels remain readable without clipping or horizontal scrolling; text expansion and the mobile keyboard are accommodated.
- Keyboard operation, visible focus, meaningful labels, measured contrast, touch targets, and reduced motion are part of the design review.
- Both entry paths preserve the visitor’s intent and reach a relevant next question. Failure states retain their work.
- Email and explicit request submission remain later steps. There are no invented time, price, delivery, or conversion promises.

## Context for the next session

- [Funnel options and question bank](conversion-funnel-options.md): overall journey, branch questions, summary, and email handoff. This brief supplies the proposed visual direction and hero copy for the next exploration.
- [Conversion research](conversion-research.md): evidence and limitations; premium styling itself has not been shown to improve PUNI conversion.
- [Acquisition experiments](acquisition-experiments.md): campaign and content strategy.
- [Website orientation](README.md): the licensed landing site lives in the private companion at `puni-pr-00/apps/website/site`; the public chat app is `apps/website/fe-01`.
- [Design vocabulary](../../libs/shared/adapters/ui-core-01/DESIGN.md) and [screen-design workflow](../runbook-screen-design.md): consult before implementation. Observable behavior changes require the repository’s OpenSpec workflow.

Suggested session opener: **“Use docs/website/landing-ui-brief.md to explore a premium PUNI landing hero and its first chat screen. Inspect dev.puni.dev, preserve prompt → chat and both selectable and typed answers, and show desktop/mobile treatments with special attention to making ‘want’ shine.”**
