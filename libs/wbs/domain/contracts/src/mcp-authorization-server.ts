/**
 * The canonical MCP resource for a configured `MCP_PUBLIC_URL`: its origin and
 * path without a trailing slash, query or fragment. mcp-01 advertises it as
 * the protected resource and requires it as every token's `aud`.
 *
 * @throws when `publicUrl` is not an absolute URL.
 */
export function canonicalMcpResourceOf(publicUrl: string): string {
  const resource = new URL(publicUrl);
  return `${resource.origin}${resource.pathname.replace(/\/$/, '')}`;
}

/**
 * mcp-01's authorization server, `<canonical MCP resource>/oauth`
 * (`wbs-mcp-agent-surface` M2): the issuer its metadata publishes and the
 * value be-01's `WBS_MCP_AUTHORIZATION_SERVER` must equal, so both sides
 * derive it with this one function.
 *
 * @throws when `publicUrl` is not an absolute URL.
 */
export function mcpAuthorizationServerOf(publicUrl: string): string {
  return `${canonicalMcpResourceOf(publicUrl)}/oauth`;
}

/**
 * `value` when it is already the canonical authorization server of some MCP
 * resource: an absolute HTTP(S) URL with no credentials, query or fragment,
 * whose path ends in `/oauth` and which {@link mcpAuthorizationServerOf}
 * reproduces exactly.
 *
 * @throws naming the setting when it is not; there is no repair.
 */
export function canonicalMcpAuthorizationServer(value: string, setting: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new Error(`${setting} must be an absolute URL`, { cause });
  }
  // Proof: with the reproduction check dropped, `admits only a value the
  // derivation reproduces exactly` (mcp-authorization-server.test.ts) and be-01's
  // config test admitted `https://WBS.example/mcp/oauth`; watched 2026-10-26.
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username !== '' ||
    url.password !== '' ||
    !value.endsWith('/oauth') ||
    mcpAuthorizationServerOf(value.slice(0, -'/oauth'.length)) !== value
  )
    throw new Error(
      `${setting} must be the canonical MCP authorization server, <MCP_PUBLIC_URL>/oauth`,
    );
  return value;
}
