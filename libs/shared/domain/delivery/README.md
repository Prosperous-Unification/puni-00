# Shared delivery observations

`@shared/delivery` defines version 1 provider-neutral observations and a read-only
`DeliveryReader`. Opaque IDs, revisions, native state, resources, URLs and observation
times retain their source provenance. No provider transport lives here.

`DeliveryObservationSchema` and `DeliveryReadingSchema` are inline ArkType wire
schemas without transforms or refinements. At the external boundary use
`validateDeliveryObservation` or `validateDeliveryReading` as well: these enforce
real calendar instants, chronology, current-check revision identity and unique
performed execution identity.

`summarizeDeliveryTiming` accepts a validated observation. Summed performed work
excludes carried and not-performed outcomes. Unknown attribution and incomplete
inventories remain explicit. Elapsed time is the first performed start to the last
performed completion, including gaps across attempts. Waiting means
attempt-start-to-execution-start, never runner queue time. These overlapping
measurements must not be added together. Empty checks imply no acceptance claim.

Run `bunx nx run shared-delivery:test:unit`, `shared-delivery:lint`,
`shared-delivery:typecheck` and `shared-delivery:build` from the repository root.
