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

## Host gate and release preparation

The full h2puni gate at `32ab8e0569c50958ac7c5436be16de249e96c061` passed 148 tasks but failed `wbs-mcp-01:test`: two processes could both fail opening an absent store when its creator lost the WAL setup lock and its peer refused the still-empty schema. A local two-process harness reproduced the race. The narrow MCP repair and its proofs are recorded in the existing organization-ownership-and-access verification artifact; the full gate must rerun on the repaired head. No full-gate success is claimed for 32ab8e.

Private commit `deb8503523ddbacbb7dd456d8b832c3a689f35a1` contains exact copies of all four public website project trees at 32ab8e and the same pinned app dependencies. All scoped checks pass, and the preview images built on h2puni with the original media publication scan. They are not yet activated. The MCP repair changes no website project or app dependency, so the four tree receipts remain the source-equivalence check for the prepared release.

Trusted-wiki admission remains blocked: the three repository activation variables are absent, and the retained d334 activation certifies only its older candidate. It has intact checksums and runtime, but no real external review record for this candidate was found in the inspected trust store. No authority, selection or certification record was manufactured or changed.

## Passing gate and live preview

The final required host gate, `H2PUNI_GATE_REPAIR_MODES=1 bin/h2puni-gate.sh eee37beb3715d2e545b28af328caef74fadec9c4`, printed that exact SHA and exited 0. Frozen install, all OpenSpec changes, format, all 149 Nx tasks across 42 projects, Burokrat test/typecheck/build, Burokrat source lint and the real-container solver smoke passed. The log is retained at `/home/puni1/puni-site-dev/releases/20260928-deb8503523dd/public-gate-eee37beb.log`. GitHub main CI and all four browser shards also passed on eee37beb. Later receipt-only documentation does not change the gated application trees; the full host gate is not claimed for a later documentation commit.

Private release `deb8503523ddbacbb7dd456d8b832c3a689f35a1` is live at `https://dev.puni.dev` and `https://dev.app.puni.dev`. Its pinned public snapshot is 32ab8e; the four website trees are byte-identical to eee37beb. A consistent, validated mode-0600 SQLite backup and the prior migration ledger were retained before activation. Startup applied additive 005; all five migration checksums and SQLite integrity passed. All three running immutable image IDs match the private release receipt and all containers are healthy.

`bun /tmp/puni-build-live-browser.mjs` passed real HTTPS Home → saved request → Build → reload → manual brief, secure host-only cookie boundaries, legacy redirect, 390px layout, original media SHA-256 equality, animation and reduced-motion poster checks. Desktop/mobile screenshots were inspected and no page errors occurred. `bun /tmp/puni-build-live-resume.mjs`, after restarting the API, recovered the same saved request and passed site/API routes and exact-origin admission/refusal checks. A live callback access-log control probe confirmed callback exclusion. Google discovery and the public OpenRouter model-list endpoint returned 200 from the deployed API without credentials or paid calls.

Google and OpenRouter runtime credentials are absent. Google sign-in is visibly unavailable; the saved request and manual brief remain usable. Real identity exchange, authenticated live streaming and paid usage settlement remain unverified, and task 4.4 stays open. Trusted-wiki certification remains a separate merge blocker as described above. The private release receipt records the source bundle, images, backup, routing and rollback references.

## Provider routing repair, 2026-09-29

Reviewing the live OpenRouter catalog against source exposed two missing explicit routing settings and missing rate ceilings. Both paid paths now send `allow_fallbacks: false`, `require_parameters: true`, and `max_price` using the same configured USD-per-million input/output rates as reservation accounting, with `request: 0` because reservation accounting has no per-request fee allowance. The mounted JSON and assistant-ui streaming tests inspect the actual serialized request. Both failed before source changes and passed afterward. Removing each of the three provider fields from each path independently caused its mounted test to fail (six negative runs); production comments name these proofs. The token-cap wire alias is unchanged and remains part of real endpoint activation testing.

The initial routing-only patch passed 39 API tests. Review then caught a rate reread after admission. The final repair captures validated rates before admission and uses the same pair for reservation, outgoing ceilings and settlement. Two mounted tests unset rates at the store admission boundary: before the repair legacy chat returned 503 and streaming threw; afterward both retain their original reservation, price ceilings, 26-micro-USD settlement and saved turns. Ten isolated invalid-rate cases reject missing, zero, negative, infinite or NaN rates without provider calls or reservations. Removing rate validation failed the undefined-input test; removing the broken-store admission invariant failed its injected-dependency test. Both guards have adjacent proof comments. Final uncached `website-be-01` test/lint/typecheck/build and dependency builds passed: 52 API tests, zero failures. Prettier and diff checks passed. Evidence is retained in `/tmp/puni-provider-routing-report.md`, `/tmp/puni-provider-routing-snapshot-report.md` and their named log files. These are fixture/source checks; the previously recorded live preview and host gate predate this repair. A new pinned release/gate is required before live activation. No credentials or paid inference were used.

[Provider research](../../../docs/website/provider-activation.md) records a conditional model/endpoint candidate. [Runtime setup](../../../docs/website/build-runtime.md) now documents the preview Compose override required for paid activation. A disposable Compose configuration check proved its base `OPENROUTER_ENABLED=0` overrides an env-file value of `1`; the explicit enable override changes only that flag while `DEMO_AUTH` stays `0`. Live settings remain disabled.

## Explicit Send restoration, 2026-09-29

The signed-in Build composer now displays the saved Home request and waits for Send. It keeps the later-message composer unavailable until the initial operation is confirmed completed. A failed pending-state write restores Send without requiring reload; a dropped initial POST remains retryable under the same server-owned key. Existing stored history and ordinary later messages still work.

The checked-in browser regression is reproducible from this checkout with three terminals:

```sh
WEBSITE_API_PORT=3118 PUBLIC_ORIGIN=http://localhost:4318 APP_ORIGIN=http://localhost:4218 WEBSITE_DATABASE_PATH=/tmp/puni-explicit-send-website.sqlite DEMO_AUTH=1 bun apps/website/be-01/src/main.ts
cd apps/website/fe-01 && VITE_API_ORIGIN=http://localhost:3118 VITE_SITE_ORIGIN=http://localhost:4318 bunx vite --host localhost --port 4218 --strictPort
bun apps/website/fe-01/browser/explicit-send.mjs
```

Run each line in its own terminal from the repository root; return to the root for the third line. Port 4318 is an exact site-origin fixture value and needs no server. The test creates owned drafts through `/intakes`, uses the loopback-only demo sign-in and checks actual `/chat/stream` requests and persisted turns. Before the fix, sign-in sent one stream POST without Send (`/tmp/puni-explicit-send-red.log`). The dropped-POST fault then showed the ordinary composer after reload (`/tmp/puni-explicit-send-recovery-red.log`). The final browser run observed zero POSTs through sign-in/reload, one initial POST after Send, one ordinary later turn, one saved Home turn after reload, and same-key retry after a dropped initial POST (`/tmp/puni-explicit-send-final-browser.log`). Removing both initial click-latch resets made an injected pending-state write failure block retry with zero POSTs (`/tmp/puni-explicit-send-pending-mutant.log`). With latch reset restored but before reusing the optimistic user turn, that write failure and retry showed two identical Home rows (`/tmp/puni-explicit-send-optimistic-probe.log`); regenerating the existing turn yields one visible and one persisted first turn (`/tmp/puni-explicit-send-optimistic-green.log`). Desktop and mobile screenshots are `/tmp/puni-explicit-send-before.png`, `/tmp/puni-explicit-send-after.png`, and `/tmp/puni-explicit-send-mobile-recovery.png`. This uses simulated local replies; no paid provider or Google credentials were exercised.

Final uncached `website-fe-01` test/lint/typecheck/build passed with 10 tests, zero failures (`/tmp/puni-explicit-send-fe-checks.log`); targeted OpenSpec validation, Prettier and diff checks passed. A separate parent rerun passed the same four uncached FE targets (`/tmp/puni-explicit-send-parent-nx.log`) and this checked-in browser regression against the isolated fixture. The final read-only reviewer found no remaining blocker. The host-wide gate and private deployment are separate release steps.
