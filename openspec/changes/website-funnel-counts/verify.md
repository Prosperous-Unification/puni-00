# Verification

Branch `batch-10/website-funnel-counts` from `origin/main` a3b1526bd, 2026-10-11. Bun tests ran
under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## Commands and results

- `NX_DAEMON=false bunx nx run-many -t lint typecheck test build test:package -p website-store-sqlite website-be-01 website-fe-01 --skip-nx-cache`:
  exit 0; store 83 tests, fe-01 84 tests, be-01 156 tests, 0 failures.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 159 passed, 0 failed;
  `validate website-funnel-counts --strict`: valid.
- `PUNI_SCREENS_STRICT=1 bun apps/website/fe-01/browser/screens.mjs` against the two loopback
  stacks (API 3118/3119, app 4218/4219, `OPERATOR_PASSWORD` and `TRUSTED_PROXY_HOPS=1` set, fresh
  SQLite files): exit 0, 74 OK lines and no other, including `operator-funnel` at 1440, 768, 390
  and 320; maximum CLS 0.043. The operator captures alone passed three further runs.
- `bunx prettier --check` on every touched file: clean.

## R5 proofs (fault injected, test observed failing, fault removed)

| Check                                  | Injected fault                                      | Observed                                                                                   |
| -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Proposals come only from submissions   | proposal query counts `intake_draft` rows           | `funnel-store.test.ts` per-day test: `manual` Expected 1, Received 2                       |
| Ceiling-settled means `unknown`        | drop `state = 'unknown'` from `readCeilingSettled`  | `guardrail-store.test.ts` overview test: count 3 and 6000 instead of 2 and 5000            |
| Operator session on `/operator/funnel` | serve the route without `operatorSession`           | `server.test.ts` "needs an operator session": Expected 401, Received 200                   |
| Counts only                            | add `intake_draft.description` to the first day row | `server.test.ts` "carries no canary text": body contained `canary-funnel-5d1e description` |
| Boundary validation of the overview    | default a missing `ceilingSettledToday` to zeros    | `guardrails-panel.test.ts` ceiling-settled test: "Received function did not throw"         |
| Thirty rows on the operator page       | render `days.slice(1)`                              | `screens.mjs` `operator-funnel`: "expected 30 UTC day rows, found 29" at all four widths   |

## Layout shift found by the captures

The first strict run failed `operator-inbox`, `operator-guardrails` and `operator-funnel` on CLS
(up to 0.195): the Guardrails panel grew from one loading line to its full height above the new,
taller Funnel panel. Guardrails now keeps its loaded layout with placeholders while loading, and
the Funnel table sits in a fixed-height region. A later full run failed `operator-inbox-390` at
CLS 0.073, the footer's height over the viewport: the signed-in panels replace the login form
after the Argon2id check, sometimes more than 500 ms after the click, and pushed a visible footer
out of view. `.operator-layout` now has `min-height: 100vh`, so the footer starts below the first
viewport.

## Not run

- The h2puni host gate (`bin/h2puni-gate.sh`): run by the orchestrator on the merge SHA.
- `bin/with-heavy-lock.sh` around the browser run: it refused on this workstation
  (`/home/puni1/.cache does not exist`); the run used exclusive local ports instead.
- The private snapshot, a preview release and a live operator read: the release lane after S4.
