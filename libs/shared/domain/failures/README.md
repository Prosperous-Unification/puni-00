# shared/failures

One framework-free reporting policy for every product and product-less tool:
`runtime:isomorphic`, `ring:domain`, `product:shared`. This library holds only
the limits, sensitive names, policy construction and reporting-loss behavior
that the three published reporting packages cannot decide for this repository.

Any project may import `@shared/failures`. The library does not own a logger,
process hook, network boundary, filesystem boundary or product-specific
exception catalogue.

## Files

- **`report-failure.ts`** — the report limits, sensitive property names,
  caller-owned secret policy and never-throw reporting wrapper.
- **`index.ts`** — the complete public surface.

## Refusals

A caller passes only the secret values it owns, never a whole configuration,
request or environment object. A key rule hides a property value but not the
same text quoted in a message or stack, so caller-owned secrets also become
text-pattern rules.

The same policy redacts the public report, including values selected by an
exception kind's disclosure selector. Reporting itself can fail;
`reported: false` is a modelled loss of both reports, never a successful
operation.

## Landmines

- The options bag and each caller's policy are long-lived values. Rebuilding
  either per report discards the reporting library's cached report maker.
- Key matching is case-insensitive because HTTP header names arrive with
  varying capitalisation.
- The report-size limit includes context and reporting errors. Truncation and
  omission markers are part of the report rather than a second JSON slicing
  pass.
- Unit and type checks here do not prove browser execution. This library makes
  no browser-execution claim.

## Test

```sh
bunx nx run shared-failures:test
```
