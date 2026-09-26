# Design — public MCP client authentication

## Public routing and identity boundary

The production ingress currently routes `/mcp` but its `/` fallback sends well-known discovery to the frontend. Route `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp`, and `/.well-known/oauth-authorization-server/mcp/oauth` to mcp-01 using exact or narrow paths. The OAuth endpoints under `/mcp/oauth/*` already fall under `/mcp`. Verify actual status, content type, metadata URLs, TLS and issuer/resource consistency at `https://wbs.bulletpoints.club`; a manifest-only assertion is insufficient. Keep the WBS-facing OAuth contract independent of the upstream IdP, including a possible WorkOS organization migration.

## Redirect policy

Registration accepts only parsed `localhost`, `127.0.0.1` or `[::1]` loopback URIs with a valid arbitrary port, or exact reviewed HTTPS hosted URIs. Reject credentials, fragments, lookalike hosts, private-network substitutes, wildcard suffixes and DNS-based equivalence. Hosted entries require default HTTPS port, exact path and no extra query. Known exact entries are:

| Client                | Exact callback                                                     | Admission                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude hosted         | `https://claude.ai/api/mcp/auth_callback`                          | Existing                                                                                                                                                     |
| Claude hosted         | `https://claude.com/api/mcp/auth_callback`                         | Existing                                                                                                                                                     |
| VS Code web           | `https://vscode.dev/redirect`                                      | Add; [official requirement](https://code.visualstudio.com/api/extension-guides/ai/mcp)                                                                       |
| Perplexity            | `https://www.perplexity.ai/rest/connections/oauth_callback`        | Add                                                                                                                                                          |
| Perplexity Enterprise | `https://enterprise.perplexity.ai/rest/connections/oauth_callback` | Add                                                                                                                                                          |
| ChatGPT               | `https://chatgpt.com/connector_platform_oauth_redirect`            | Admit only after WBS meets [issuer-identification requirements](https://developers.openai.com/plugins/build/auth) and the connection displays this exact URI |

ChatGPT may instead display `https://chatgpt.com/connector/oauth/{callback_id}`. That template is **not** an allowlist entry: copy the exact displayed URI into reviewed configuration for that connection and test it. Apply the same exact-entry process to hosted Cursor, Copilot Studio and other installation-specific callbacks. A client metadata document URL is not a redirect URI. Authorization requires the exact URI registered to that client; token exchange requires the exact URI bound to the grant. Keep PKCE and state binding.

## Scopes, lifetime and live acceptance

The client requests `wbs:read wbs:write`; a returned token and mounted write operation must prove both requested and granted scopes. Keep omitted-scope default at read-only. Verify ordinary-user project ownership and denial on another user's project. Exercise token expiry, actual refresh-token grant, access after refresh, refresh-token replay/revocation and post-revocation denial. The mcp-01 default `MCP_ACCESS_TOKEN_TTL` is 3600 seconds because prior dev evidence showed registration advertised refresh but did not trace a refresh grant; do not shorten it or claim continuous access until a live trace proves renewal. Record the observed dev setting separately from the default. Public smoke must include discovery, DCR, sign-in, read, reversible write and these renewal/refusal paths, with no credentials printed.
