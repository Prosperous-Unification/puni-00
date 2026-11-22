# Verify: declutter-build-chat

Run 2026-11-22 in a worktree of `origin/main`, on local loopback fixture stacks (demo `DEMO_AUTH=1`, AI-off and the scripted-provider `conversation-api.mjs`). No paid inference, no deployed environment touched.

## Unit and project targets

- RED: the three new harness tests (`two or fewer remain`, `stays hidden while more than two`, `without repeated chrome`) failed against the old markup; `a demo conversation labels every reply Simulated` already passed and stays as a guard.
- GREEN: `bun test ./apps/website/fe-01/src` 184 pass, 0 fail (with `env -u CLAUDECODE`).
- `bunx nx run-many -t lint typecheck build test -p website-fe-01`: success (with 4 dependency tasks).
- `bunx openspec validate declutter-build-chat`: valid.

## R5 proofs (each fault injected, observed, restored)

| Check                                                    | Injected fault                      | Observed                                                           |
| -------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Counter hidden above two                                 | render the counter unconditionally  | `the allowance line stays hidden …` failed                         |
| One AI disclosure                                        | label every reply `PUNI · AI`       | `the thread shows the conversation without repeated chrome` failed |
| Shortcut retired, focus to email                         | keep `Send my request now` rendered | `opening the contact form …` failed on `toBeUndefined`             |
| —                                                        | drop the email focus effect         | same test failed on `activeElement`                                |
| Credit below the conversation (`screens.mjs` build-live) | remove the full-height harness rule | `credit sits beside the conversation` at 1440/1024/768/390/320     |
| Dark scoped palette (`scoped-contrast.mjs`)              | card fill 0.06 instead of 0.05      | `dark scoped palette changed` in build-scoped-review               |

## Browser

- `screens.mjs` strict, offset 300: build-live, build-disabled, build-paused, build-reduced-motion, build-media-failed, menu, start-over: all OK (42 checks; CLS 0.000, no small targets, no overflow). Manual states (manual, manual-ai, manual-receipt, manual-nocookie, manual-malformed-draft, loading, error): exit 0. Scoped editor (manual-scoped-edit/preview/receipt, build-scoped-review): exit 0, minimum text contrast 6.33:1 light, 7.70:1 night.
- header-parity: one run failed only at 320 px where the live dev.puni.dev side came back unstyled (Arial 14px); the immediate rerun passed at all widths. It compares against the live site; this change does not touch the header.
- `screens.mjs` masthead label audit still expected `Home,Build,Services,Blog`; the About link (#903) made every Build capture fail on main too. Updated to the actual list.
- `explicit-send.mjs` (demo stack): exit 0. `conversation.mjs` (scripted stack): exit 0.
- `scoping.mjs` (scripted stack): fails at its first `editRequest` (waiting for `Add references or edit brief`), identically against an unchanged `origin/main` build: pre-existing, not addressed here.
- Not run: `request-editor.mjs` (needs its outbound fixture stack), `arrival-choice.mjs` and `analytics.mjs` (analytics-enabled build), `proposal-flow.mjs`.

## Judged by eye

Captures before/after at 1440 and 390 (production look via a provider rewrite, demo, editor open, email step, scrolled footer) and 320 for the email step. Changed after review: the redundant `Send my request now` above the open contact form is gone with focus moved to the email; `Change this / Keep exploring` moved below the email form so the lead line is followed by its field. Remaining long privacy line under the email is spec-bound contact copy and kept.
