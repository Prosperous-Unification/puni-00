## ADDED Requirements

### Requirement: Bounded first response evidence

The HTTP observer SHALL perform one GET / against a loopback HTTP origin, follow no redirects, inspect at most 64KiB, and bound both headers and body by a finite deadline no greater than 30 seconds. It SHALL report path, nullable status/content type, root-marker presence, elapsed duration and a typed failure without logging response content. Invalid bounds and non-origin or foreign targets MUST throw before a request.

#### Scenario: First denial

- **WHEN** the first response is 503 text/plain without a root marker
- **THEN** the checker fails before its mutating phases and includes the response status, path, content type, root-marker absence and duration

#### Scenario: Headers or body never arrive

- **WHEN** headers never arrive or a body stream never ends
- **THEN** the observer reports deadline failure within its finite request budget plus timer scheduling jitter

#### Scenario: Oversized response or redirect

- **WHEN** the response exceeds 64KiB or returns a redirect
- **THEN** the observer fails without following another authority or retaining content

#### Scenario: Invalid request boundary

- **WHEN** supplied authority is foreign, contains credentials, has a non-root path or the deadline is outside 1–30000ms
- **THEN** the observer throws before fetching

### Requirement: Independent convergence observations

The separate diagnostic SHALL record the immediate observation and verdict independently from later GET-only observations over 30 seconds by default. The window SHALL include the first request and bound subsequent requests and pauses by remaining time. The diagnostic MUST NOT invoke the full checker or expose mutation commands. Its CLI exit SHALL reflect the immediate verdict.

#### Scenario: Later recovery

- **WHEN** the immediate response fails and a later response succeeds
- **THEN** the report retains the failed immediate verdict and records later success separately

#### Scenario: Permanent denial

- **WHEN** every response is denied
- **THEN** the finite window ends with the failed immediate verdict and denied observations
