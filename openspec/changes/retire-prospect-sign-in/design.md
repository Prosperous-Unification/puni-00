# Design: retire prospect sign-in

## Context

Decisions D1, D3, D4 and D9 of the batch 10 website scope (ADR 0039 amendment) remove the account
path. This design records how the removal keeps existing data valid and what stays read.

## Route removal

The retired handlers are deleted, not guarded: a request to one of them falls through to the final
`404 not_found` like any unknown path, after the general request window and the exact-app-Origin
guard. Nothing about them is special-cased, so no retired route can answer anything but what an
unknown route answers. The shared helpers that only they used (`prospectSession`,
`validSessionCsrf`, OIDC discovery and ID-token validation, the concept builders, the JSON
`requestProvider` call and its 1,024-token reservation) go with them, and so does the `jose`
import.

`/draft`, `/entry`, `/brief`, `/intakes` and `/proposals` keep their anonymous branches unchanged.
A browser still holding a `puni_session` cookie is now just a browser with an unknown cookie.

## Startup refusal

`readWebsiteApiConfig` refuses every environment name starting with `OIDC_`, set or empty, before
it reads anything else. The prefix rule (not a list of four names) means no future sign-in setting
can be added by accident without touching this check. `WebsiteApiConfig` loses its `oidc*` fields,
so a caller cannot construct the API with them either.

## One pump

`streamConfirmedReply` loses the options only the account stream used: `abortOnDisconnect` (a
disconnect always aborts), and the optional `decline`, `recordGeneration` and `onProviderFailure`
become required.

## Store

`WebsiteStore` loses every account writer and the account reservation. The tables stay. Reads that
remain on legacy rows:

- The site-day spend (`readSiteSpend`, the conversation admission's site sum) and the site-wide
  unsettled-call count still add `provider_call`. Follow-up: drop that read when
  `SELECT count(*) FROM provider_call` is 0 on the deployed database.
- Request retention (backfill, report, coverage, operator resolution) still covers
  `software_request` and its content tables. The write-time anchor (`anchorRequestContent`) has no
  caller left and is removed; an existing pending subject that a legacy row fills is still moved to
  `ambiguous` by the startup backfill.
- The startup `chat_operation` in-flight recovery is removed: nothing can be in flight.

`tripInferencePause` keeps its rule; its only caller is now the conversation admission.

## Tests

The obsolete OIDC, demo sign-in, sign-out, `/chat*` and `/concept*` tests are deleted. Tests that
seeded spend or legacy requests through the removed writers seed rows directly
(`libs/website/adapters/store-sqlite/src/testing/legacy-account-fixture.ts`, and small SQL helpers
in the API and browser fixtures). The bad-rate and missing-privacy refusals move from `/chat` to
`/conversation/stream`.

## Rollback

Revert the PR. No schema changed, so the previous image runs on the same database.
