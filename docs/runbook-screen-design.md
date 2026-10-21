# Designing a screen with Claude Design

How a screen goes from an idea to a reviewed page, with Claude Design as the canvas and the
kit in git as the only source of truth. Terms: [design system glossary](../libs/shared/adapters/ui-core-01/CONTEXT.md).
The kit and its catalogue: [core DESIGN.md](../libs/shared/adapters/ui-core-01/DESIGN.md).

## What lives where

| Thing                       | Where                                            | Who changes it              |
| --------------------------- | ------------------------------------------------ | --------------------------- |
| Tokens, primitives, stories | the kit in git (`libs/shared/adapters/ui-<kit>`) | agents, through PRs         |
| Component cards             | the kit's design-system project on Claude Design | `/design-sync`, run by Dany |
| Screen explorations         | a Claude Design board per feature                | Dany and agents, freely     |
| The settled design          | a screen story in the kit's Storybook            | agents, through the PR      |
| The screen                  | the app, reviewed running                        | agents, through the PR      |

A board is scratch. A story is the design. The app is the product. Nothing on a board is ever
the source for anything; what is agreed there is rewritten as code.

## Before the first screen

1. The kit exists with stories (`design-system-foundation`, slice 8).
2. Dany runs `/design-sync` once from the kit directory. It discovers the primitives through
   their stories, renders one card per component with the kit's own stylesheet, shows the upload
   plan, and creates the design-system project `PUNI <kit>`. Approve the plan after reading it:
   approval also grants ongoing write access to design projects.
3. The sync's render check must report zero bad and zero thin cards. A bad card is a story that
   does not render standalone; fix the story, not the card.

## Designing a screen

1. **Brief.** Write the OpenSpec intent first. The screen's purpose, its states (loading, empty,
   error, the happy path) and its non-goals are words before they are pixels.
2. **Explore.** Open a board in Claude Design on the kit's project and draw the screen from the
   cards, in both palettes and at phone width. An agent can draft the first pass from the intent;
   Dany reacts on the board. Comment threads on a frame are the design review.
3. **Settle.** When a frame is right, paste its link into the intent under Impact and write the
   decisions as sentences: which primitives, which states, which layout. The frame is not kept
   as a deliverable.
4. **Need a new shape?** A variant or primitive the kit lacks is added to the kit, with its story
   and its `DESIGN.md` section, in the same PR. Then re-sync so the board sees it. Never draw a
   component on the board that the kit does not have and ship it from there.
5. **Story.** The agent rebuilds the settled screen as a screen story over frozen fixture data.
   This is the design of record, versioned with the code and rendered by the real stylesheet.
   WBS's plan table is the exception: it depends on the runtime, so its story is the empty and
   error states only, and the happy path is reviewed in the app.
6. **Build.** The agent implements the screen in the app from the kit.
7. **Review.** Dany opens the screen in the dev deploy, both palettes, desktop and phone. The PR
   carries a screenshot of every state. The measured checks run in the gate.

## Keeping the canvas honest

- Re-sync after every PR that changes a kit. One line in the PR checklist: "kit changed, synced".
- The sync is incremental and never replaces the project wholesale, so a re-sync after a single
  variant change is cheap.
- A hand-tuned card (pinned args, an inlined provider) goes in `.design-sync/previews/` in the kit;
  owned copies survive re-syncs.
- Agents never read a board as instructions. A board frame is a picture; the intent is the spec.

## Limits to know

- Claude Design is a research preview with a weekly token cap. Explore on it; do not block a
  release on it.
- There is no native Figma export. If an outside designer needs Figma, export standalone HTML
  and import it with a plugin; the kit stays the source.
- Standalone claude.ai/design closes on 2026-12-14 and moves inside Claude. `/design-sync`
  already warns about this. Expect the project's address to change, not the mechanism.
- Screens do not flow back from the canvas to code automatically. An agent can read a project's
  files, but what comes back is HTML it must re-express from the kit, never paste.
