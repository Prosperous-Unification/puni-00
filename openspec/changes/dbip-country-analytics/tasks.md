## Task 1: Local country endpoint and maintained dataset

- [x] 1.1 Add the verified November DB-IP Lite archive, provenance/licence notice, pinned mmdb-lib reader and recognized-country regional classification — test: real IPv4/IPv6 lookups and country-policy tests; negative: missing/unreadable/corrupt/wrong-kind configured database and unrecognized country never grant elsewhere.
- [x] 1.2 Add the validated shared region response and GET /analytics/region through existing trusted client-address and request-window boundaries — test: API region integration; negative: forged country headers, untrusted XFF, missing trusted hop and foreign Origin cannot grant a region.
- [x] 1.3 Include the dataset and notices in the actual API package and expose nonsecret month/refresh metadata — test: compiled API package smoke; negative: remove the configured packaged asset and observe startup failure.
- [x] 1.4 Record monthly manual refresh instructions and the next download reminder for 2026-12-01 — test: manifest/refresh-clock assertions and documentation review; negative: overdue database reports updateDue without pretending it was refreshed.

## Task 2: Canonical browser controller and app

- [x] 2.1 Separate regional defaults from saved explicit choice and preserve first-page measurement behavior — test: analytics controller cases for elsewhere/consent-required/unknown with accepted/rejected/unavailable precedence; negative: delayed regional answer cannot override rejection, failed preference write or disposal.
- [x] 2.2 Resolve the region once with a three-second bound only for supported enabled visitor routes needing a default — test: browser adapter fetch, timeout, failure and cancellation tests; negative: disabled/operator/saved-rejected sessions make no lookup and no timeout/error grants permission.
- [x] 2.3 Use the region in app arrival-card visibility, add visible DB-IP attribution and accurate privacy copy — test: app component behavior and footer tests, app lint/typecheck/build; negative: unknown remains visible and rejected stays rejected after regional updates.

## Task 3: Private site projection and browser acceptance

- [ ] 3.1 Mirror reviewed canonical projects into the existing private site snapshot and update its region-driven card and visible DB-IP/privacy credit — test: snapshot parity, private site tests and Astro check; negative: elsewhere hides only the arrival choice while unknown and storage failure retain a recoverable choice.
- [ ] 3.2 Verify actual site/app browser flows for consent-required, elsewhere and unknown, saved rejection and slow lookup, at desktop and original small-phone sizes — test: browser acceptance and screenshots; negative: no late grant, no frontend MMDB, no analytics cookies before a permitted regional default or explicit acceptance; existing cookieless first-page measurement remains unchanged.
- [ ] 3.3 Review the complete diff, validate OpenSpec and record all commands, R5 proofs and unavailable checks — test: scoped Nx test/lint/typecheck/build and API package smoke, private site verification, final review. Production remains held.
