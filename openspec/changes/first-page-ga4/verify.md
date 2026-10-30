# Verification: first-page GA4

Planning only. User explicitly requests GA4 collection from the first landing view before cookie permission, with funnel events and no separate dashboard. Normal builds/demo remain disabled; production remains held.

The current source is still the basic blocker: no analytics implementation edits or runtime/account actions have occurred. Managed worktree5270 is based on public9a; frozen Bun install passed. Existing analytics baseline:66 tests passed,0 failed,373 assertions across2files using bun test ./libs/website/adapters/analytics/src --timeout=30000. Existing explicit rejection will remain a full opt-out. No detailed pre-consent activity recorder is planned.

## Failure proofs

| Check                                            | Injected fault / observed failure                         | Restored pass |
| ------------------------------------------------ | --------------------------------------------------------- | ------------- |
| First Home measurement without cookie permission | Pending RED against current basic controller              | Pending       |
| Consent-before-config and cookie rejection       | Pending real vendor-path negative for changed boundary    | Pending       |
| Safe startup/context/bounds/dedup                | Pending scoped production-path negatives if checks change | Pending       |

## Remaining and limits

All source tests/checks, real-tag collector verification, public gate/private projection, dev delivery/Cloud and account reports are unverified. Cookieless network collection does not establish complete low-volume GA4 reporting. No provider-key, paid inference, Ads/UPD, Google-account setting, marketing or production action is authorized by this source plan.
