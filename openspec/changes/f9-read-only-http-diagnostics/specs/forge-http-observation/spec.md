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

### Requirement: Incomplete observations cannot prove ingress denial

The checker SHALL distinguish transport, deadline and body-limit observation failures from a completed response mismatch in its emitted failure message. The recovery coordinator MUST NOT credit those observation failures as ingress denial, even when all positive phases pass. A root marker already received within the first 64KiB SHALL remain true when a later read times out, resets or exceeds the body cap; marker presence MUST NOT turn such failures into a passing observation.

#### Scenario: Observation failure reaches the recovery coordinator

- **WHEN** the real checker exits after connection refusal, a response deadline or a body limit
- **THEN** its output fails the production coordinator's ingress-negative verdict and overall acceptance

#### Scenario: Partial body evidence

- **WHEN** a split root marker arrives before a later stream hang or reset, or appears within the allowed prefix of an oversized chunk
- **THEN** root-marker evidence remains true and the observation retains its deadline, transport or body-limit failure

#### Scenario: Remaining-window clamps

- **WHEN** the initial or final request is slower than the remaining window, or the next pause exceeds that window
- **THEN** the convergence window ends within its elapsed budget plus timer scheduling jitter
