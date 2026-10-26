import { issueMcpMachineGrant } from '@wbs/contracts';

import { bind } from '../http/endpoint';
import type { MachineGrantAuthority } from '../runtime/machine-grant-authority';

/**
 * mcp-01's machine grant route (`wbs-mcp-agent-surface` M3). The
 * `mcp-dedicated` identity policy has already checked mcp-01's dedicated
 * secret; the key or assertion comes from the body alone and is never echoed,
 * logged or stored.
 */
export function machineGrantRoutes(authority: MachineGrantAuthority) {
  return [
    bind(issueMcpMachineGrant, async ({ body }) => {
      const outcome = await authority.issue(body);
      switch (outcome.kind) {
        case 'issued': {
          const scopes: ('read' | 'write')[] = [...outcome.scopes];
          return {
            ok: true,
            status: 200,
            body: {
              grant: outcome.grant,
              credentialId: outcome.credentialId,
              personId: outcome.personId,
              organizationId: outcome.organizationId,
              scopes,
              expiresAt: outcome.expiresAt,
              runId: outcome.runId,
            },
          } as const;
        }
        case 'not_activated':
          return { ok: false, status: 409, body: { error: 'not_activated' } } as const;
        case 'invalid_body':
          return { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
        case 'refused':
          return { ok: false, status: 401, body: { error: outcome.refusal } } as const;
        case 'unsupported_assertion_type':
          return {
            ok: false,
            status: 401,
            body: { error: 'unsupported_assertion_type', typ: outcome.typ },
          } as const;
      }
    }),
  ] as const;
}
