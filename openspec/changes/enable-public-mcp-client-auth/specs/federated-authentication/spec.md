## ADDED Requirements

### Requirement: OAuth client redirects are exact and reviewed

Dynamic registration SHALL accept parsed loopback hosts `localhost`, `127.0.0.1` and `[::1]` with valid arbitrary ports, and only exact reviewed hosted HTTPS callback URIs. Hosted callbacks SHALL use the default HTTPS port, exact host and path, and no query, credentials or fragment. The initial hosted list SHALL include Claude's `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback`, VS Code's `https://vscode.dev/redirect` and `https://insiders.vscode.dev/redirect`, and Perplexity's `https://www.perplexity.ai/rest/connections/oauth_callback` and `https://enterprise.perplexity.ai/rest/connections/oauth_callback`. ChatGPT's stable `https://chatgpt.com/connector_platform_oauth_redirect` MAY be admitted only when WBS satisfies issuer identification and the connection displays that exact URI; callback-ID and other installation-specific URIs SHALL require an individually reviewed exact entry. Private-use schemes such as `cursor://` SHALL NOT be listed. Registration SHALL refuse the whole request with `invalid_redirect_uri` when any requested redirect is not an RFC 3986 absolute URI of at most 512 bytes, or carries credentials, a fragment, or a `code`, `state`, `iss`, `error`, `error_description` or `error_uri` query field; otherwise it SHALL register only the listed redirects, return exactly that list, and refuse the request when none is listed. Authorization SHALL require an exact registered redirect, and token exchange SHALL require the redirect bound to the grant.

#### Scenario: A documented hosted client registers

- **GIVEN** a registration with the exact VS Code or Perplexity callback listed above
- **WHEN** the OAuth server validates it
- **THEN** registration succeeds and authorization uses only that registered URI

#### Scenario: A client registers a mixed callback list

- **GIVEN** a registration listing a reviewed callback beside a well-formed unlisted one, such as `cursor://anysphere.cursor-mcp/oauth/callback` with `https://vscode.dev/redirect`
- **WHEN** the OAuth server validates it
- **THEN** it registers and returns only the listed callbacks, and authorization with a dropped one is refused without a redirect

#### Scenario: A malformed callback refuses the whole registration

- **GIVEN** a registration listing a reviewed callback beside a non-string, relative, over-long, RFC 3986-invalid (whitespace, control or non-ASCII characters, bad percent escapes), credential-bearing or fragment-bearing URI, or one whose query pre-sets an authorization-response field (percent-encoded names included)
- **WHEN** the OAuth server validates it
- **THEN** it refuses with `invalid_redirect_uri` and registers nothing

#### Scenario: A lookalike or substituted callback is refused

- **GIVEN** a callback with a lookalike host, changed hosted path/query/port, credential or fragment, or a token request substituting another redirect
- **WHEN** registration or grant exchange is attempted
- **THEN** the request is refused without disclosing a code or token to that URI

#### Scenario: A loopback client chooses an ephemeral port

- **GIVEN** a valid loopback callback at a client-selected port
- **WHEN** it is registered and used unchanged through token exchange
- **THEN** the OAuth flow accepts it regardless of which valid port was selected
