# Website funnel analytics verification

Status: implementation pending; no Google tag was activated by this work.

The user supplied development measurement ID `G-R0JM3R4SSV` on 2026-10-25. Use the controlled consent adapter rather than the unconditional supplied snippet. This ID belongs to dev.puni.dev, as the user clarified. It may serve both development site and development app after consent/continuity verification; production needs a separate property and ID. Development tracking stays disabled unless explicitly configured.

The supplied ID identifies the development stream; administrative settings have not been independently verified. Production property and stream remain to be supplied. Event retention, advertising/enhanced-measurement settings, generate_lead key-event setup, saved reports and DebugView/processed reports remain unverified. No Analytics management connector is available in this session.

Contract, consent, leakage, blocked-provider, cross-host navigation and confirmed-lead tests have not yet run. Server counts must stay separate from the consenting GA cohort. The privacy contact supplied by the user is Danylo Fedorov, dany@puni.dev.

Recommended environment mapping: one Dev property/web stream for dev.puni.dev and dev.app.puni.dev, using G-R0JM3R4SSV; one separate Production property/web stream for puni.dev and app.puni.dev, whose ID is still pending. Google documents [same-stream measurement](https://support.google.com/analytics/answer/10071811?hl=en) and [shared subdomain cookies with configurable prefixes](https://developers.google.com/tag-platform/security/guides/customize-cookies). Both development hosts share puni.dev as their cookie ancestor, so isolate environments with distinct analytics and consent cookie names; a dev.puni.dev cookie cannot be read by dev.app.puni.dev. Functional draft claims remain host-only.

## Shared events and consent adapter — 2026-10-25

Commit `15bc916a748bb2a9e766f1fa20ec9c4797b69c1e` adds the bounded event contract, shared `website-analytics` browser adapter, Vite configuration wrapper and declared portability closure. Independent scoped review approved the slice with no Critical or Important findings. It does not wire or activate analytics in the UI.

- `env -u FORCE_COLOR -u NO_COLOR bunx nx run-many -t test,lint,typecheck,build -p website-contracts,website-analytics,website-fe-01 --output-style=static`: all 14 targets passed without cache hits. Contracts 75, adapter initially 25, frontend 126 tests passed. After a focused transport-outcome correction, all five adapter/dependency targets passed again with 26 adapter tests and one matching cached dependency. Final coverage: **227 tests, zero failures**, plus **three portability tests**.
- `bun test ./tools/workspace/portability.test.ts --test-name-pattern 'the website app|an import of an alias|analytics dependencies'`: three tests/15 expectations passed against the public file only. Portable ESLint, TypeScript and formatting passed. Source formatting, whitespace, strict analytics OpenSpec validation and normal commit hooks passed. Migration/doc hooks skipped by file filters; Tool Wiki explicitly remains inactive because its external activation root is absent.
- The page-dispatch return regression first reported sent after injected transport unavailability; the corrected path returns unavailable. No broad API/store suite was repeated: those implementations did not change. Their inferred builds passed as dependencies.
- Real browser-port tests use jsdom with resource loading disabled and manually delivered script completion/error events. They verify queued Google commands and actual shared cookie-jar behavior, not remote Google payloads or account settings. No live Google request, measurement event, paid provider call, private deployment or full host gate ran.

### Behavior and integration boundaries

The adapter is framework-neutral, with one configuration-checked instance per Window. Its page/bootstrap owner must retain that lifetime; component StrictMode cleanup must not dispose it. It exposes disabled/denied/loading/ready/unavailable states, two explicit loading attempts per page, a ten-second load deadline, synchronized six-calendar-month preferences and generation fencing on withdrawal. Denied/loading interactions are dropped; only the current sanitized page is measured after readiness. Consumer milestone observation must advance independently of consent, never replaying earlier interactions on acceptance.

The supplied development ID is restricted to the exact development HTTPS hosts; production rejects it. Both environments share the puni.dev cookie ancestor but use different preference names and analytics prefixes. Localhost/operator/unknown pages do not load the real tag. The registered services index and three current service details have fixed metadata; new five-service slugs are later integration work. No new About page or unpublished article is invented. The production campaign registry is empty until a campaign is deliberately registered.

Generic dispatch cannot emit a lead. `dispatchLead` keeps the receipt only in consented session storage and same-page memory, records enqueue rather than delivery, and permits omitted starting choice when authoritative recovery context is absent. Blocked/cleared storage, separate tabs/devices and network loss limit deduplication; operational submissions remain authoritative. Withdrawal clears only configured analytics cookies/markers and disables dispatch. Typed optional storage/loader/transport failure cannot become a required submission dependency; unexpected programmer errors propagate.

### Observed failure proofs

All 41 temporary faults below failed their production-path tests and were restored. Adjacent source Proof comments identify the covered assertions. The scoped reviewer confirmed the mutation receipts; the initial silent-cookie test was tightened to distinguish successful preference writing from failed measurement-cookie deletion before its final red/green proof.

| Checks / injected faults                                            | Test observation                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Event shape/name/own-name, required/bounded/extra fields            | Contract tests refused malformed records; bypassing the extra-field boundary leaked a sentinel email into the adapter sink.          |
| Campaign catalogue/own-fields and raw campaign forwarding           | Invalid registrations or unregistered sentinel attribution were admitted under fault.                                                |
| Preconsent loader, readiness and queue                              | Basic-blocking tests observed a loader before acceptance, denied dispatch reported sent, or an earlier brief replayed on acceptance. |
| Safe location/referrer and unsupported route                        | Initialization exposed query/hash/private referrer paths or measured operator navigation as Home.                                    |
| Stale loader generation                                             | A superseded completion readied a newer acceptance generation.                                                                       |
| Preference expiry/version/denial/finite timestamp                   | Expired, unsupported, rejected or fractional-expiry preferences authorized loading.                                                  |
| Cookie configuration/ancestor/environment                           | Wrong ancestor was admitted, actual cross-host sharing failed, or development preference granted production consent.                 |
| Measurement ID, production development-ID rejection, host selection | Wrong dev tag, dev tag on production or production host in dev configuration was admitted.                                           |
| Load attempt bound and single loader                                | Third retry or concurrent duplicate loader started.                                                                                  |
| Lead bypass/receipt validation/marker/corrupt marker                | Generic lead bypass, invalid confirmation input, duplicate enqueue or silent marker corruption was admitted.                         |
| Cookie cleanup/isolation/readback and disable collection            | Measurement cookie survived, functional storage was deleted, deletion refusal was hidden or the disable flag stayed false.           |
| Singleton configuration and storage programmer errors               | Incompatible configuration was reused or TypeError was hidden as optional unavailability.                                            |
| Automatic pageviews and default app enablement                      | The pre-insertion config enabled automatic pageviews or missing app configuration stopped defaulting to disabled.                    |
| App adapter dependency                                              | The actual frontend projection refused the omitted analytics dependency; the covering test failed under the injected missing edge.   |

### Review follow-up and remaining proof

Minor deferred to final whole-branch review: `parseAnalyticsEvent` checks required properties with `Object.hasOwn` but reconstructs enumerable entries. A non-enumerable required property can pass presence checking and disappear from the returned event; the reviewer reproduced a missing category in a funnel-failure event. Ordinary object literals are unaffected and no omitted value leaks. This is recorded for final robustness triage, not silently discarded.

App milestone hooks/consent UI, actual loaded-Google payload interception, private five-tree snapshot/site integration, real site-to-app attribution, account settings/reports, production ID and exact-SHA host gate remain outstanding. Local command tests do not certify enhanced measurement, user-provided-data settings, retention or actual remote collection.
