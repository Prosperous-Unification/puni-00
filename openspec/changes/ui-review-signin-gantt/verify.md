# Verify

All runs 2026-10-16 in `/home/df/wd/puni/ui-signin-gantt` (branch `ui-review/signin-gantt` from
3e06eb5a4), Chromium on Linux, `E2E_PORT_SHIFT=2900`.

## Commands and results

- `bunx nx run wbs-fe-01:test` (with `test:unit`) — 75 files / 940 tests, 208 files / 4127 tests, 4 files / 5 tests passed.
- `bunx nx run wbs-fe-01:lint:fast` and `typecheck` — passed. `bunx prettier --check` on touched files — clean.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 215/215 valid.
- Playwright: `control-edge, drop-cue, sign-in, shell-faults, scroll-stability, hints` — all passed
  (the scroll probe's three opt-in cases skip by design); `gantt.spec.ts` marker rule
  `--repeat-each 3` — 3/3 passed; wider suites listed in the PR body.

## R5 proofs (observed failures)

New specs against 3e06eb5a4 — 9 failed:

- F-124 `Continue with SSO: outside · Expected: >= 3 · Received: 1.08…` (light), `1.01…` (dark).
  Injected on the branch: merge removed from `buttonVariants` — the same two figures; `outline` back
  on `border-input` — `Received: 1.22…` (light), `1.28…` (dark).
- F-125 `server unavailable: the word mark moved · Expected: <= 0.5 · Received: 96` at 1440, 1024 and 375.
- F-126 `in Full · Expected: 600 · Received: 0`. Vitest, carry removed: `expected +0 to be 236`;
  mount read removed: `Unable to find an element with the text: Aug 2026`.
- F-128 `below 010.4 lands as a child of 010 · Expected: <= 1 · Received: 32` (light and dark).
- F-129 `the wait ring after the drop · Expected: 0 · Received: 1`. Injected: `dragstart` listener
  not added — the same; the focus guard removed — `a hint card after the drop · Expected: 0 · Received: 1`.
