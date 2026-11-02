import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { type JwtClaims, oidcIdentityFromClaims, type TokenVerifier } from '@wbs/auth';
import { decodeJwt } from 'jose';

import type { McpConfig } from './config';
import type { MachineCaller } from './machine-admission';

/**
 * One admitted `/mcp` bearer: its verified claims, the credential be-01 calls stand behind (a
 * consent session's upstream token, a machine token's grant), the session if any, and the
 * machine caller when it is a machine token (`wbs-mcp-agent-surface` M5).
 */
export interface CallerAdmission {
  /** Verified, or in gateway mode decoded from what the gateway verified. */
  readonly claims: Readonly<Record<string, unknown>>;
  readonly upstreamToken: string;
  readonly mcpSessionId: string | null;
  readonly machine: MachineCaller | null;
}

interface CallerAdmitter {
  admitCaller(token: string): Promise<CallerAdmission>;
}

interface DownstreamTokenResolver {
  upstreamTokenFor(token: string, verified?: JwtClaims): Promise<string>;
  callerSessionFor?(
    token: string,
  ): Promise<{ readonly upstreamToken: string; readonly mcpSessionId: string | null }>;
}

function admitsCallers(verifier: TokenVerifier): verifier is TokenVerifier & CallerAdmitter {
  return 'admitCaller' in verifier && typeof verifier.admitCaller === 'function';
}

function resolvesDownstreamToken(
  verifier: TokenVerifier,
): verifier is TokenVerifier & DownstreamTokenResolver {
  return 'upstreamTokenFor' in verifier && typeof verifier.upstreamTokenFor === 'function';
}

/**
 * Authenticates one MCP HTTP request and preserves the credential its be-01 calls carry. In
 * standalone mode a verifier that admits callers ({@link CallerAdmission}) verifies the bearer
 * once; in gateway mode the gateway has verified it, and a machine token is refused (M11).
 */
export async function authenticateCaller(
  authorization: string | null,
  mode: McpConfig['MCP_AUTH_MODE'],
  verifier: TokenVerifier,
  groupPrefix: string,
  groupsClaim: string,
): Promise<AuthInfo> {
  const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');
  if (match?.[1] === undefined) throw new Error('Authorization: Bearer token is required');
  const token = match[1];
  const admitted = await admissionOf(token, mode, verifier);
  const identity = oidcIdentityFromClaims(admitted.claims, { groupPrefix, groupsClaim });
  return {
    token: admitted.upstreamToken,
    clientId: identity.subject,
    scopes: [...identity.scopes],
    extra: {
      issuer: identity.issuer,
      subject: identity.subject,
      mcpSessionId: admitted.mcpSessionId,
      machine: admitted.machine,
    },
  };
}

async function admissionOf(
  token: string,
  mode: McpConfig['MCP_AUTH_MODE'],
  verifier: TokenVerifier,
): Promise<CallerAdmission> {
  if (mode === 'gateway') {
    const claims = decodeJwt(token);
    // Gateway mode has no machine admission (M11): a machine token would otherwise be forwarded
    // to be-01 as the caller's own bearer. A `wbs_mk_` key never gets here: `decodeJwt` throws.
    // Proof: with this refusal removed, `refuses a machine token in gateway mode, forwarding
    // nothing` (machine-admission.test.ts) answered 200 and be-01's fake recorded the call;
    // watched 2026-10-27.
    if (claims['token_use'] === 'machine') throw new Error('gateway mode admits no machine token');
    return { claims, upstreamToken: token, mcpSessionId: null, machine: null };
  }
  if (admitsCallers(verifier)) return await verifier.admitCaller(token);
  const claims = await verifier.verify(token);
  if (!resolvesDownstreamToken(verifier))
    return { claims, upstreamToken: token, mcpSessionId: null, machine: null };
  if (verifier.callerSessionFor === undefined)
    return {
      claims,
      upstreamToken: await verifier.upstreamTokenFor(token, claims),
      mcpSessionId: null,
      machine: null,
    };
  return { claims, ...(await verifier.callerSessionFor(token)), machine: null };
}
