## ADDED Requirements

### Requirement: Registered MCP clients survive a restart

mcp-01 SHALL keep every registered MCP client in the durable MCP store with its
exact redirect URIs, forwarding source, proven state and lifetimes, so a client
registered before mcp-01 restarts can authorize and exchange a code afterwards
without registering again. Lifetimes, the global and per-source registration
caps and promotion to proven SHALL hold across the restart exactly as within one
process. A malformed stored client SHALL fail the request rather than be read
as an absent client.

#### Scenario: Client registered before a deploy authorizes after it

- **GIVEN** a client registered with mcp-01 and still within its lifetime
- **WHEN** mcp-01 restarts on the same store and the client starts authorization with its `client_id`
- **THEN** authorization redirects to the provider and the resulting code exchanges for tokens

#### Scenario: Caps count clients registered before the restart

- **GIVEN** the global or per-source registration cap is reached by clients registered before a restart
- **WHEN** another client from the same source registers after the restart
- **THEN** registration answers 429 `temporarily_unavailable`, while another source can still register when the global cap allows

#### Scenario: Lifetimes continue across the restart

- **GIVEN** an unproven client whose lifetime an authorization extended before a restart, and a proven client
- **WHEN** time passes beyond the unproven absolute cap but within the proven lifetime
- **THEN** the unproven client is unknown and the proven client still authorizes

### Requirement: An unknown client is told to register again

Authorization with a `client_id` that is not registered or whose lifetime has
ended SHALL answer `400` with `error` `invalid_client` and an
`error_description` saying the client must register again, without redirecting.
Every other malformed authorization request, including a redirect URI the known
client did not register, SHALL keep answering `invalid_request`.

#### Scenario: Unknown client_id

- **GIVEN** a `client_id` this mcp-01 store never registered
- **WHEN** a well-formed authorization request names it
- **THEN** the response is 400 `invalid_client` with a re-registration `error_description` and no `Location`

#### Scenario: Unregistered redirect of a known client

- **GIVEN** a registered client
- **WHEN** authorization names a redirect URI it did not register
- **THEN** the response stays 400 `invalid_request`
