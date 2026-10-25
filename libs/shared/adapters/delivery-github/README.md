# Shared GitHub delivery reader

`@shared/delivery-github` implements the `@shared/delivery` `DeliveryReader` for
canonical public `https://github.com/<owner>/<repo>/pull/<n>` links. Any other URL
is `unsupported` without network traffic. Reads are anonymous, fixed-origin GETs to
`api.github.com` with redirects refused and the pinned API version `2026-03-10`.

One read is bounded to 30 seconds, 32 GETs, 2 MiB per body and 8 MiB in total. The
PR, its merge event history (merged PRs only), current checks and the run listing are
required; the attempt and job scan stops while the closing PR re-read still fits the
budget and marks run and attempt inventories partial. Provider refusals, malformed
records and exhausted required reads become `unavailable` readings; caller
cancellation rejects with `AbortError`; unexpected faults rethrow.

The reader has no cache or quota sharing: WBS composes it behind `DeliveryGate`
(`@wbs/core/service/delivery-gate`), which caches readings and limits provider reads
per organization and per process.

Run `bunx nx run shared-delivery-github:test:unit`, `shared-delivery-github:lint`,
`shared-delivery-github:typecheck` and `shared-delivery-github:build` from the
repository root.
