# Verification

Implementation is in progress. No live Google or OpenRouter activation is claimed.

## Observed so far

- Bun installed the five exact assistant-ui/AI SDK/OpenRouter versions from package.json; normal commit hooks passed for plan/dependency commit `eac69dc26`.
- Pinned OpenSpec 1.12.0 validated this change, with zero issues.
- Backend author final checks: API 39/39 tests (227 assertions), store 2/2, focused typechecks/lint/format and API build pass. Parent independently ran all 12 uncached Nx test/lint/typecheck/build targets for website-be-01, website-store-sqlite and website-contracts; all passed.
- Parent ran `/tmp/puni-build-journey.mjs` against local site 4327, app 4217 and fixture API 3117. Home submission, local test sign-in, streamed initial reply, reload without another provider call, a second turn, generated booking concept, mobile panel switch and manual follow-up all passed. No browser page errors or horizontal overflow. Calls before/after reload were both 2 (the shared fixture had handled one earlier test).
- Parent inspected the initial desktop/mobile screenshots and requested a shorter workspace. The final author screenshot `/tmp/puni-build-fe-1440.png` shows a compact heading, independently scrolling panels and composer visible within the first desktop viewport. Final parent browser pass is recorded below when complete.
- Parent ran the existing geometry check on the updated site at 1440×900, 1440×688, 390×588 and 320×568. Navigation font/top alignment, portrait and contained submit control passed.
- GoDaddy read showed no existing `dev.app` records; authorized A record `dev.app.puni.dev → 62.238.48.248`, TTL 600 was added and read back. Receipt is `/tmp/puni-build-dns-receipt.json`. The token stays outside repositories.
- The deployed preview containers remain the prior healthy release. Runtime variable-name inspection found only `OPERATOR_PASSWORD`; Google/OpenRouter credentials are absent.

## Review and rulings

- Backend reviewer found completed replay incorrectly depended on current provider configuration, Google readiness omitted the web-client secret, and legacy JSON chat settled usage before saving its operation. All three were repaired and independently rereviewed without remaining findings. The legacy route retains the same durable completion contract; leaving the gap could lose a paid reply on a crash.
- Site reviewer found hung entry/intake fetches had no deadline. Both now have a 10-second timeout with retained text and retryable feedback; browser deadline faults and timer suppression controls passed. The tradeoff is retry feedback on a slow connection; it must never grant Build access or treat uncertainty as absence.
- Backend guard mutations were observed for all 14 faults listed below; exact source bytes were restored after each run and the targeted checks passed afterward.

## Outstanding

Run the required host gate, transfer exact public trees/dependencies, deploy and verify HTTPS/cross-origin cookies. Real Google return and paid OpenRouter usage remain unverified until runtime credentials exist.

## Backend R5 observations

Each injected production fault failed its mounted API test (restart recovery uses the store test):

| Injected fault                      | Observed failure                                 |
| ----------------------------------- | ------------------------------------------------ |
| Accept foreign entry Origin         | Expected 403, received 200                       |
| Accept cookie without live draft    | Missing/expired entry response mismatch          |
| Remove stream CSRF                  | Expected 403, received 200                       |
| Remove operation body-hash conflict | Expected idempotency conflict absent             |
| Trust browser initial key           | Expected replay 200, received 429                |
| Treat absent raw usage as zero      | Unknown-usage stream unexpectedly finished       |
| Remove cancel CSRF                  | Expected 403, received 200                       |
| Invert cancel ownership             | Expected 404 for another account, received 200   |
| Ignore Google secret readiness      | Configured-state test failed                     |
| Ignore disabled-provider admission  | Expected 503 for new call, received 200          |
| Remove startup recovery             | Expected unknown, received inflight              |
| Remove fixed Build URL origin check | Expected constructor throw absent                |
| Return app Origin for site intake   | Expected localhost:4321, received localhost:4201 |
| Omit Google token-form secret       | Expected fixture-secret, received null           |

The legacy paid-save regression injected failure when inserting the assistant turn. Before the fix, usage was settled at 28 micro-USD despite the failed save. After atomic settlement, usage remained unsettled and neither turn was persisted.

## Frontend review fixes

- A reload after a request failed before reaching the API initially regenerated the previous saved user turn. Retry now checks whether the pending turn actually exists beyond saved history; otherwise it sends the stored text with the same operation key. The browser fault observed the same text/key and only one provider call on retry. Turn count comes from current messages, avoiding a stale mount-time history count.
- A stalled Build entry read initially remained on Checking beyond 13 seconds. All initial Build reads now share a ten-second deadline; the browser fault reached visible Try again and recovered after the request was released. Paid generation retains its separate timeout.
- Removing the entry-reason validation, malformed pending-state validation, retry boundary and current turn-count logic each failed the corresponding focused test. Corrupt session storage displayed the error boundary; clearing local recovery restored the workspace.
- Cancellation and unknown usage remain enforced on the server. After an operation becomes unknown during an open page, Send may remain visually enabled until reload; another paid call is refused by the API.
- App bundles include dependency licenses; Vite reports a roughly 725 kB main chunk. This is a load-size limitation, not a failed build.

## Final local integration

After all review fixes, parent ran all four uncached FE Nx test/lint/typecheck/build targets successfully. FE tests report 10 passing tests and 29 assertions. Parent repeated the full fixture Home → saved request → app → local test identity → initial stream → reload → second turn → booking concept → mobile brief panel → manual follow-up journey. Reload left provider calls unchanged at 5; no page errors or horizontal overflow occurred. Final desktop and mobile screenshots were inspected. These are fixture observations, with no real Google identity or paid model. Independent source review reported no release blockers for backend, FE, site gateway or private recovery.
