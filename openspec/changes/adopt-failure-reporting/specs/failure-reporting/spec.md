## ADDED Requirements

### Requirement: One call captures both reports of one occurrence

The reporting boundary SHALL produce its diagnostic and public reports with one reporting call and one shared occurrence identifier for object and primitive failures alike.

#### Scenario: An object failure is captured once

- **GIVEN** an object failure
- **WHEN** the reporting boundary captures it
- **THEN** the diagnostic and public reports carry the same occurrence identifier

#### Scenario: A primitive failure is captured once

- **GIVEN** a thrown primitive
- **WHEN** the reporting boundary captures it
- **THEN** the diagnostic and public reports carry the same occurrence identifier

### Requirement: Unknown failures disclose only the generic public contract

A failure without a disclosure policy SHALL disclose the `INTERNAL_ERROR` code and a generic message, and SHALL disclose nothing read from the caught value.

#### Scenario: An unknown value reaches a public audience

- **GIVEN** a caught value with no disclosure policy
- **WHEN** its public report is produced
- **THEN** the report contains `INTERNAL_ERROR` and the generic message
- **AND** the report contains no content read from the caught value

### Requirement: Sensitive properties are skipped everywhere

The reporting policy SHALL skip named sensitive properties in diagnostic and public reports at every depth and regardless of property-name capitalisation.

#### Scenario: A capitalised nested sensitive property is reported

- **GIVEN** a caught value with a nested sensitive property whose name is capitalised
- **WHEN** both reports are produced
- **THEN** neither report contains the property's value

### Requirement: Caller-owned secrets are scrubbed as text

The reporting policy SHALL scrub a secret owned by the calling boundary from messages, stacks and context text, and from details selected by a disclosure policy into the public report, rather than only hiding a property that held it.

#### Scenario: A secret appears outside its original property

- **GIVEN** a caller-owned secret repeated in a message, stack and context
- **WHEN** both reports are produced with that secret in the redaction policy
- **THEN** neither report contains the secret text

#### Scenario: A disclosure selector chooses a secret

- **GIVEN** a disclosure policy that selects a caller-owned secret into public details
- **WHEN** the public report is produced with that secret in the redaction policy
- **THEN** the selected value is redacted

### Requirement: Diagnostic reports are bounded visibly

One byte budget and the configured depth and breadth limits SHALL bound the diagnostic report, and the report SHALL identify which limit caused content to be omitted or truncated.

#### Scenario: The byte budget is reached

- **GIVEN** failure content larger than the diagnostic byte budget
- **WHEN** the diagnostic report is produced
- **THEN** its encoded size stays within the budget
- **AND** the report marks the affected content as omitted or truncated

#### Scenario: The cause depth is reached

- **GIVEN** a cause chain deeper than the configured depth
- **WHEN** the diagnostic report is produced
- **THEN** the deepest reported child identifies the depth limit

#### Scenario: The child count is reached

- **GIVEN** an aggregate failure wider than the configured child limit
- **WHEN** the diagnostic report is produced
- **THEN** the report identifies the child limit

### Requirement: Reporting does not invoke accessors

Reporting SHALL NOT execute property accessors on the caught value.

#### Scenario: A caught value has a throwing getter

- **GIVEN** a caught value with an enumerable getter that throws
- **WHEN** the diagnostic report is produced
- **THEN** the getter is not invoked
- **AND** the property is represented as not inspected

### Requirement: Reporting loss is returned visibly

If reporting fails, the wrapper SHALL return a visible reporting loss with a correlation handle and a fixed reason, SHALL NOT throw, and SHALL NOT represent the failed report as successful.

#### Scenario: The report library throws

- **GIVEN** a caught value the report library cannot inspect
- **WHEN** the reporting wrapper is called
- **THEN** it returns a failed reporting outcome with a correlation handle and reason
- **AND** it neither throws nor returns reports

### Requirement: Redacted and truncated reports satisfy installed schemas

The diagnostic and public reports SHALL validate against their installed report schemas after redaction and truncation.

#### Scenario: Both transformations affect one occurrence

- **GIVEN** a failure whose reports contain a secret and exceed their size limits
- **WHEN** both reports are redacted and truncated
- **THEN** the diagnostic report validates against the installed diagnostic schema
- **AND** the public report validates against the installed public schema

### Requirement: A browser fault boundary discloses a public report and nothing raw

A caught render fault SHALL disclose exactly one of three things and nothing else: the public report's generic message with its occurrence identifier, for a fault nothing modelled; a validated sentence selected by the caught value's own kind, with that occurrence identifier, for a kind whose sentences are public by construction; or fixed loss text with a local correlation handle, when reporting could not describe the caught value at all. In every one of the three cases it SHALL disclose no text read from the caught value other than a sentence a kind's own selector validated, and SHALL disclose neither the caught value's cause nor a stack to the page or to the browser console.

#### Scenario: A secret-bearing render fault reaches the root boundary

- **GIVEN** a component that throws an error whose message and cause carry a personal identifier, a credential and an internal locator
- **WHEN** the root fault boundary catches it in a browser
- **THEN** the page shows the generic public message and the occurrence identifier
- **AND** neither the rendered markup nor any browser console line contains the message, the cause or a stack

#### Scenario: A modelled chart fault is disclosed by its own kind

- **GIVEN** a chart data fault whose sentence its own module composed as an own string-valued property
- **WHEN** the chart's fault boundary catches it
- **THEN** the panel shows that sentence and the occurrence identifier
- **AND** an unmodelled error caught by the same boundary shows the generic public message instead

#### Scenario: A kind's own sentence cannot be read as a string

- **GIVEN** a chart data fault whose own message is an accessor, or is not a string
- **WHEN** the chart's fault boundary decides what to disclose
- **THEN** the panel shows the generic public message and the occurrence identifier
- **AND** no accessor on the caught value is invoked

### Requirement: Deciding what a fault discloses never throws

Deciding what a caught fault discloses SHALL model a failure to inspect the caught value as an outcome carrying fixed text and a correlation handle, and SHALL NOT raise a second failure out of the boundary that is already handling the first.

#### Scenario: Reporting cannot describe the caught value

- **GIVEN** a caught value whose inspection makes the reporter throw
- **WHEN** a fault boundary decides what to disclose
- **THEN** the boundary renders fixed text and a local correlation handle, which is the third disclosure case and carries no public report
- **AND** the boundary's disclosure selector is never applied to that value
- **AND** the boundary above it renders nothing

#### Scenario: A kind's disclosure selector throws

- **GIVEN** a fault boundary whose disclosure selector raises an exception for the caught value it is given
- **WHEN** that selector is applied while deciding what to disclose
- **THEN** the boundary renders the generic public message and the occurrence identifier
- **AND** the console line names the selector as what was lost
- **AND** the exception reaches nothing above the boundary

### Requirement: The shared reporting module executes in a browser

The shared failure reporting module SHALL produce both reports inside a browser, built through the frontend's shipped bundler configuration, without a Node built-in in its executed import closure.

#### Scenario: The module reports a failure in Chromium

- **GIVEN** the frontend's shipped bundler configuration
- **WHEN** a probe importing the shared reporting module runs in Chromium
- **THEN** it produces a public report carrying an occurrence identifier
- **AND** the page raises no error and requests no unexpected origin

### Requirement: The backend reports an unexpected endpoint failure once

The mounted backend endpoint boundary SHALL keep its generic 500 response for an unexpected
failure, SHALL write exactly one diagnostic operator record for that failure, and SHALL NOT
disclose content read from the caught value through the response. The diagnostic and public
reports captured for the occurrence SHALL share one occurrence identifier.

#### Scenario: A store fails behind an admitted request

- **GIVEN** an admitted request whose store operation throws an unknown failure containing a caller-owned secret
- **WHEN** the mounted endpoint boundary handles the failure
- **THEN** the response is status 500 with the existing generic body
- **AND** one operator record carries the redacted diagnostic report, occurrence identifier and fingerprint
- **AND** the response and record contain no caller-owned secret

#### Scenario: Reporting cannot inspect the failure

- **GIVEN** an admitted request fails with a value the report library cannot inspect
- **WHEN** the mounted endpoint boundary handles the failure
- **THEN** the response remains the existing generic 500
- **AND** one operator record carries a visible reporting loss and correlation handle

#### Scenario: A modeled request outcome is returned

- **GIVEN** a request is refused by a declared parser, identity, origin or endpoint rule
- **WHEN** the mounted endpoint boundary returns that modeled 4xx response
- **THEN** no unexpected-failure operator record is written

### Requirement: A live gateway backend failure is reported once without changing its frame

The gateway WebSocket boundary SHALL write exactly one correlated diagnostic operator record for
each live forward or resume failure, SHALL keep the existing failure frames and open connection,
and SHALL disclose no caught-value content through those frames. A rejection caused by connection
cancellation SHALL write no record and no frame.

#### Scenario: A live forward fails

- **GIVEN** an authenticated live socket whose backend forward rejects with a caller-owned secret
- **WHEN** the gateway handles the rejection
- **THEN** it sends the existing `backend_unavailable` frame with `retry_after: 5`
- **AND** it writes one redacted diagnostic record correlated by occurrence and connection
- **AND** the socket remains usable

#### Scenario: A live resume fails

- **GIVEN** an authenticated live socket whose backend resume rejects
- **WHEN** the gateway handles the rejection
- **THEN** it sends one existing unavailable denial per requested subscription followed by the existing empty resume acknowledgement
- **AND** it writes one redacted diagnostic record for the whole rejected resume attempt
- **AND** it sends no replay event from the failed attempt

#### Scenario: Connection close cancels backend work

- **GIVEN** a forward or resume request is pending for a connection
- **WHEN** close aborts that connection and the request rejects
- **THEN** the gateway writes no failure record, increments no unavailable metric and sends no late frame

#### Scenario: A modeled gateway outcome occurs

- **GIVEN** invalid input, an authentication or origin refusal, a declared subscription refusal, a successful replay, or an identity-recheck policy close
- **WHEN** the gateway handles that outcome
- **THEN** it writes no unexpected-backend-failure record

### Requirement: An unexpected MCP tool failure is reported once and disclosed generically

The MCP tool-call boundary SHALL preserve its tool-result envelope, SHALL disclose only a generic
public sentence and correlation handle for an unexpected call failure, and SHALL write exactly
one correlated sanitized diagnostic operator record. Correctable local input failures, declared
upstream 4xx refusals, authentication/session outcomes and unknown-tool protocol errors SHALL keep
their existing classification and useful public text and SHALL NOT write an unexpected-failure
record.

#### Scenario: A local tool input is invalid

- **GIVEN** a known tool call has an undeclared input, a missing path parameter or a non-scalar URL value
- **WHEN** mcp-01 handles the call
- **THEN** it returns the existing correctable `isError` tool content
- **AND** no unexpected-failure operator record is written

#### Scenario: be-01 returns a declared refusal

- **GIVEN** be-01 returns a 4xx refusal carrying its correction code and details
- **WHEN** mcp-01 handles the call
- **THEN** the existing `isError` tool content retains the status, code and useful body
- **AND** no unexpected-failure operator record is written

#### Scenario: a tool transport or successful-response decoder fails

- **GIVEN** fetch rejects, response-body reading rejects, a non-4xx response fails, or a successful body is not JSON
- **WHEN** the SDK tool-call boundary handles the failure
- **THEN** it returns one `isError` text result containing the generic public sentence and reference
- **AND** the agent receives no content read from the caught value or upstream body
- **AND** one operator record carries the sanitized diagnostic report under the same occurrence identifier

#### Scenario: reporting cannot inspect an unexpected failure

- **GIVEN** an unexpected call failure the report library cannot inspect
- **WHEN** the tool-call boundary handles it
- **THEN** it returns fixed loss text with a local correlation handle without throwing
- **AND** one operator record visibly records the reporting loss
