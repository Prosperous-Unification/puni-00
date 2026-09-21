---
status: accepted
---

# mcp-01 owns its refresh-family store

mcp-01 owns a SQLite store for MCP refresh families, sessions, and digests because it is the authorization server that creates, rotates, and revokes them. Keeping this state in be-01 would give an authentication adapter write access to the product database and couple be-01 deploys to MCP-only credentials; retaining it in process memory would invalidate every family whenever dev sync restarts mcp-01.

Provider credentials are encrypted with mcp-01 store keys and MCP tokens are retained only as SHA-256 digests. The file lives in deployment state outside the synced checkout, and mcp-01 migrates it before serving.

## Considered options

**Persist only the signing key.** Rejected because access signatures would survive while their revocation and refresh families disappeared.

**Store families in be-01.** Rejected because MCP is dev-only today and be-01 must not own or expose provider refresh credentials for an adapter.
