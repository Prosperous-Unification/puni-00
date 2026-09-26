## ADDED Requirements

### Requirement: OAuth client redirects are exact and reviewed

Dynamic registration SHALL accept parsed loopback hosts `localhost`, `127.0.0.1` and `[::1]` with valid arbitrary ports, and only exact reviewed hosted HTTPS callback URIs. Hosted callbacks SHALL use the default HTTPS port, exact host and path, and no query, credentials or fragment. The initial hosted list SHALL include Claude's `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback`, VS Code's `https://vscode.dev/redirect`, and Perplexity's `https://www.perplexity.ai/rest/connections/oauth_callback` and `https://enterprise.perplexity.ai/rest/connections/oauth_callback`. ChatGPT's stable `https://chatgpt.com/connector_platform_oauth_redirect` MAY be admitted only when WBS satisfies issuer identification and the connection displays that exact URI; callback-ID and other installation-specific URIs SHALL require an individually reviewed exact entry. Authorization SHALL require an exact registered redirect, and token exchange SHALL require the redirect bound to the grant.

#### Scenario: A documented hosted client registers

- **GIVEN** a registration with the exact VS Code or Perplexity callback listed above
- **WHEN** the OAuth server validates it
- **THEN** registration succeeds and authorization uses only that registered URI

#### Scenario: A lookalike or substituted callback is refused

- **GIVEN** a callback with a lookalike host, changed hosted path/query/port, credential or fragment, or a token request substituting another redirect
- **WHEN** registration or grant exchange is attempted
- **THEN** the request is refused without disclosing a code or token to that URI

#### Scenario: A loopback client chooses an ephemeral port

- **GIVEN** a valid loopback callback at a client-selected port
- **WHEN** it is registered and used unchanged through token exchange
- **THEN** the OAuth flow accepts it regardless of which valid port was selected
