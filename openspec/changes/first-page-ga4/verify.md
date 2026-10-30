# Verification: first-page GA4

Task 1 source implementation is ready for independent SPEC/QUALITY review. Enabled measurement enqueues the initial registered page and safe startup steps with analytics storage denied; a valid v1 rejection still blocks Google entirely. Existing permission grants analytics storage only. Acceptance updates the existing tag without controller-owned historical replay. Normal builds/demo remain disabled, and production remains held.

The shared controller now distinguishes loading, cookieless, permitted (`ready`), rejected (`denied`), disabled and unavailable states. The Google Arguments layer holds at most 100 startup commands for ten seconds per attempt, with two explicit attempts per controller. Overflow cancels startup and visibly marks optional transport unavailable. Cookieless lead deduplication uses memory only; validated persistent markers require permission. Functional request storage is preserved.

## Commands and observed results

Executed in managed worktree `5270`, branch `feat/puni-app-guided-conversion`, from planning commit `d956f6f6595ce3646f8464053349e7de3013ab88`.

- Baseline supplied by the coordinator: shared analytics 66 tests passed, 0 failed, 373 assertions.
- Initial RED: `bun test ./libs/website/adapters/analytics/src ./apps/website/fe-01/src/analytics-components.test.tsx --timeout=30000` produced 16 expected failures against the former basic blocker, including first-page/startup collection and updated privacy controls.
- Additional RED: consent saturation/refusal and unreadable retry tests produced three failures, exposing an implicit retry that concealed transport/storage refusal. The retry now requires successful preference synchronization and a pre-existing unavailable state.
- Final affected-project check: `bunx nx run-many -t test,lint,typecheck,build -p website-analytics,website-fe-01 --parallel=2 --skip-nx-cache --output-style=static` passed all eight requested targets and three dependency builds. Shared analytics: 80 tests, 0 failed, 446 assertions. App: 140 tests, 0 failed, 420 assertions. Both projects passed lint, typecheck and browser build. The only emitted lint diagnostic was the existing `NO_COLOR`/`FORCE_COLOR` environment warning.
- `bunx openspec validate first-page-ga4 --json`: 1 passed, 0 failed, two existing long-requirement warnings. Requirement wording was preserved.
- Named-file Prettier checking and `git diff --check` passed before commit. Normal pre-commit hooks also run at commit time; their result is recorded in the task report.

## Failure proofs

Each of these 24 injected production fault variants produced exit 1 in a targeted `bun test ./libs/website/adapters/analytics/src --timeout=30000 -t '<test phrase>'` invocation. Every file was restored immediately; the final uncached project run above verifies restoration. Adjacent `Proof:` comments identify the corresponding boundaries.

| Boundary                       | Injected fault and observed negative                                                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored rejection               | Interpreting `accepted:false` as unset loaded Google in `valid legacy rejection`.                                                                                                                                                              |
| Preference fields (6 variants) | Bypassing version, accepted type, expiry type, safe-integer expiry, exact fields, or expiry admitted cookies in `malformed preference fields` / `valid legacy rejection`. The expiry-type fault also removed the dependent safe-integer guard. |
| Rejection admission            | Bypassing the rejected choice branch loaded Google for `valid legacy rejection`.                                                                                                                                                               |
| Event admission                | Bypassing collection admission sent a rejected interaction in `valid legacy rejection`.                                                                                                                                                        |
| Startup admission              | Excluding loading from eligible collection lost the initial page/step in `first page and safe startup`.                                                                                                                                        |
| Loader admission               | Removing the already-collecting fence duplicated startup initialization in `first page and safe startup`.                                                                                                                                      |
| Generation                     | Removing the generation comparison let an old completion ready the new loader in `superseded loader`.                                                                                                                                          |
| Initial consent                | Forcing granted consent failed `browser starts cookieless`.                                                                                                                                                                                    |
| Resumed consent                | Always using consent default failed the required update in `returning permission`.                                                                                                                                                             |
| Startup event bound            | Removing the event cap retained 110 queued interactions in `startup commands are bounded`.                                                                                                                                                     |
| Startup consent bound          | Removing consent saturation admission failed `full startup queue`.                                                                                                                                                                             |
| Startup context bound          | Removing context admission grew the queue to 101 in `navigation never grows`.                                                                                                                                                                  |
| Consent refusal                | Ignoring an unavailable consent command admitted later events in `consent transport refusal`.                                                                                                                                                  |
| Permission downgrade           | Omitting cookie cleanup retained configured cookies in `expiry downgrades`.                                                                                                                                                                    |
| Unchanged permission           | Removing the equality admission accessed blocked session storage in `cookieless browser leads`.                                                                                                                                                |
| Marker permission (2 variants) | Removing the read or write permission fence touched unavailable persistent markers in `cookieless leads use memory`.                                                                                                                           |
| Explicit retry                 | Retrying after failed synchronization concealed transport/storage refusal in `retry refuses unreadable` / `consent transport refusal`.                                                                                                         |
| Automatic retry                | Starting from unavailable state on dispatch violated the explicit retry bound in `optional loading/transport/storage`.                                                                                                                         |

Initial unreadable preference storage is separately tested from an absent choice: unreadability blocks optional loading; absence starts cookieless collection. Browser leads also work with unreadable session storage before cookie permission. Existing host/environment, payload allowlist, receipt corruption, withdrawal cleanup, functional-cookie preservation and failure tests remain covered.

## Remaining and limits

Task 1 independent review is pending. Task 2 owns the real Google-tag/local-HTTPS collector, app browser harness label/policy updates and private site parity/privacy notice. The current evidence establishes vendor command enqueue and local state/storage behavior; it does not establish actual collector payloads, Google acknowledgement or processed GA4 reports. Google's own consent-update behavior is a separate actual-payload observation, not controller historical replay.

The exact public host gate, source CI, private projection/build/CI, development delivery/Cloud inspection and account reports were not run in this slice. No detailed pre-consent recorder, dashboard, provider key, paid inference, Ads/UPD, Google-account setting, deployment or production action was performed. Cookieless network collection does not establish complete low-volume GA4 reporting.
