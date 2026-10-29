import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';

import { importMachineGrantKeys } from '../runtime/machine-grant';
import { TEST_MACHINE_GRANT_ENV, TEST_MCP_AUTHORIZATION_SERVER } from './machine-grant-fixture';
import type { Answer, HarnessMachineGrants, OrganizationHarness } from './organization-harness';

/** mcp-01's dedicated secret, from {@link TEST_MACHINE_GRANT_ENV}. */
const SECRET = TEST_MACHINE_GRANT_ENV['MCP_BE_INTERNAL_SECRET'];
const GRANT_KEY = TEST_MACHINE_GRANT_ENV['WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT'];
/** What mcp-01 asks for by default (`MCP_MACHINE_TOKEN_TTL`, 43200 s): 12 hours. */
const GRANT_SECONDS = 12 * 60 * 60;

/**
 * Machine grants composed with {@link TEST_MACHINE_GRANT_ENV}'s fixed values, for
 * {@link OrganizationHarness.openComposedWith}, so {@link callForwarded} can ask for grants.
 */
export async function forwardingMachineGrants(): Promise<HarnessMachineGrants> {
  return {
    secret: SECRET,
    keys: await importMachineGrantKeys({ current: GRANT_KEY, previous: null }),
    authorizationServer: TEST_MCP_AUTHORIZATION_SERVER,
  };
}

/**
 * One call of an agent holding `key`, as it reaches be-01 on the MCP path
 * (`wbs-mcp-agent-surface` M3, M5): mcp-01's token endpoint posts the key to
 * `/internal/mcp/machine-grants` with its dedicated secret, and its tool call
 * then sends the grant as Bearer beside that secret. A grant is asked for on
 * every call, as `twilight-dash mcp token` asks for a token on every
 * `headersHelper` run.
 *
 * A refused grant is answered as the call's answer: mcp-01's token endpoint
 * answers it `invalid_client`, so the agent never reaches `/mcp`. Every other
 * answer is be-01's to the call. The harness must be composed with
 * {@link forwardingMachineGrants}. The real mcp-01 in front of this is
 * exercised by `swarm-end-to-end.db.test.ts` (`mcp-agent-stack.ts`).
 */
export async function callForwarded(
  h: OrganizationHarness,
  key: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Answer> {
  const issued = await h.request('/internal/mcp/machine-grants', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [MCP_INTERNAL_SECRET_HEADER]: SECRET },
    body: JSON.stringify({
      issuer: TEST_MCP_AUTHORIZATION_SERVER,
      credential: { kind: 'api_key', key },
      expiresAt: Math.floor(Date.now() / 1000) + GRANT_SECONDS,
    }),
  });
  const text = await issued.text();
  // be-01's own grant route answers JSON; the cast reads the one field mcp-01 reads.
  const answer = text.startsWith('{') ? (JSON.parse(text) as { grant?: unknown }) : text;
  if (issued.status !== 200 || typeof answer !== 'object' || typeof answer.grant !== 'string')
    return { status: issued.status, body: answer };
  return h.callWith(answer.grant, method, path, body, { [MCP_INTERNAL_SECRET_HEADER]: SECRET });
}
