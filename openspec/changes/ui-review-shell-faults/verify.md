# Verify

All runs 2026-10-15 in `/home/df/wd/puni/ui-shell-faults` (branch `ui-review/shell-faults` from
5b65fd5ae), Chromium on Linux, `E2E_PORT_SHIFT=2900`.

## Commands and results

- `bunx nx run wbs-fe-01:test --skip-nx-cache` (with `test:unit`) — 74 files / 933 tests, 204 files / 4024 tests, 4 files / 5 tests passed. Targeted first: `bunx vitest run src/app.test.tsx src/components/presence/presence-panel.test.tsx
src/components/wbs/project-page.test.tsx src/components/auth` — 5 files, 178 tests passed.
- `bunx nx run wbs-fe-01:lint:fast` and `typecheck` — passed. `bunx prettier --check` on touched files — clean.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 200/200 valid.
- Playwright (built preview stack, shift 2900): `shell-faults, header, dark-mode, quiet-load, home,
mobile, hover-cards, rendering-baseline` — 112 passed, 36 skipped (the suites' own conditional skips).

## R5 proofs (observed failures)

`e2e/shell-faults.spec.ts` run with `app.tsx`, `presence-panel.tsx` and `styles.css` put back to
5b65fd5ae — 5 failed:

- F-079: `getByRole('heading', { name: 'Server unavailable' })` element(s) not found (sign-in form drawn).
- F-078: `Expected pattern: /^Live: / Received string: "Online: local-dev (you)"`.
- F-077: `getByRole('heading', { name: 'Reconnecting' })` element(s) not found.
- F-076: `above: the top edge Expected: >= 3 Received: 2.6301…` (light); `into: the top edge Received: 1` (dark).

Vitest against 5b65fd5ae: 9 failed (Try again not found ×5; Reconnecting/Live heading or region not
found ×4). Injected faults on the branch:

- Roster drawn while reconnecting again: `expected <p …(1)></p> to be null`, `expected <ul …(1)>…`.
- `attempt` removed from the session effect's dependencies: `Unable to find role="link" and name
"Continue with SSO"` in `reads the session again on Try again…`.
