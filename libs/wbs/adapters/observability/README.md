# observability

The one logger and the one metrics seam, so three tiers' output can be read as
one stream. `runtime:bun`; OpenTelemetry and pino are process adapters.

## Five files

- **`logger.ts`** — `createLogger({ service })`, the pino logger every app
  builds from.
- **`log-schema.ts`** — the fields a line may carry, so a query across tiers is
  written once; `err` is a diagnostic report or a visible reporting loss, and
  nothing else.
- **`serializers.ts`** — `createFailureSerializer(redact)`, which turns what a
  boundary logged under `err` into that failure's diagnostic report, and
  `registerReportedFailure`, which a boundary that already reported a failure
  uses so its outcome is reused rather than reported again.
- **`metrics.ts`** — `Counter`, over the OpenTelemetry meter.
- **`prometheus.ts`** — framework-free Prometheus collection for app-owned HTTP
  endpoints.

## Refusals

Nothing here refuses anything: a logger that threw would turn a reporting
problem into a failed request. It is also the one place in the repo where
swallowing is correct, and it is bounded to **writing a line**.

## Landmines

- **A caught value is untrusted data.** Provenance is a registration this
  process performed, held in a `WeakMap`; it is never a `reported` property
  read off the value. A structural check both discloses a forged report's
  contents and runs the value's accessors.
- **Never print a secret value.** `@shared/failures` redacts and bounds the
  report; this library adds no second pass and never writes the raw caught
  value. A logger is given only the secrets its own process owns.
- **Only the diagnostic report is logged.** The public report is what a user or
  an agent is told; writing it here would leave the operator with nothing to
  debug, and the diagnostic report must never travel the other way. The schema
  refuses a public report in the `err` field.
- **Pino does not catch a throwing serializer.** It rethrows into the
  `logger.error(...)` call and writes no line, so the serializer keeps every
  read, selection and record construction inside one guard.
- `Counter` had **no caller** until gw-01's socket seam; a metric nothing
  increments is a dashboard that reads zero and means "not wired".

## Test

```sh
bunx nx run wbs-observability:test
```
