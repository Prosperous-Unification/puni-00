import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { type } from '@wbs/validation';

import type { Concealed } from './token-request';
import type { FetchLike } from './wbs-client';

/** One machine grant request, as mcp-01's token endpoint sends it to be-01 (M3). */
export interface MachineGrantRequest {
  /** mcp-01's canonical authorization server; be-01 compares it with its own setting. */
  readonly issuer: string;
  readonly credential:
    | { readonly kind: 'api_key'; readonly key: Concealed }
    | { readonly kind: 'oidc'; readonly assertion: Concealed };
  /** The `exp` asked for, in seconds; be-01 caps it. */
  readonly expiresAt: number;
  readonly run: string | null;
}

/** A grant be-01 issued: the credential it names and the scopes derived from it alone. */
export interface IssuedMachineGrant {
  readonly kind: 'issued';
  readonly grant: string;
  readonly credentialId: string;
  readonly personId: string;
  readonly organizationId: string;
  readonly scopes: readonly ('read' | 'write')[];
  /** The grant's `exp`, in seconds. */
  readonly expiresAt: number;
  readonly runId: string | null;
}

/**
 * be-01's answer to one grant request:
 * - `issued`;
 * - `refused`: the credential or assertion was refused, or nothing is issued
 *   before activation. Each source answers its own single OAuth error, so the
 *   cases stay indistinguishable to the client;
 * - `unsupported_assertion_type`: the assertion declared this `typ`;
 * - `run_refused`: the `wbs_run` looks like a secret;
 * - `unavailable`: be-01 could not be reached, or failed (it reports its own failure).
 */
export type MachineGrantAnswer =
  | IssuedMachineGrant
  | { readonly kind: 'refused' }
  | { readonly kind: 'run_refused' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'unsupported_assertion_type'; readonly typ: string };

/** mcp-01's client for be-01's `POST /internal/mcp/machine-grants`. */
export interface MachineGrantClient {
  issue(request: MachineGrantRequest): Promise<MachineGrantAnswer>;
}

/**
 * be-01 answered the grant route with something this release does not model:
 * a missing or wrong `MCP_BE_INTERNAL_SECRET` (`internal_unauthorized`), an
 * answer impossible for the source asked, or a malformed body. A deployment
 * fault, never a client's refusal: it propagates, so the token request fails
 * as the server's and is reported, and no client is told its credential is bad.
 */
export class MachineGrantDefect extends Error {}

const ISSUED = type({
  grant: 'string',
  credentialId: 'string',
  personId: 'string',
  organizationId: 'string',
  scopes: "('read' | 'write')[]",
  expiresAt: 'number.integer',
  runId: 'string | null',
});
const REFUSAL = type({ error: 'string', 'typ?': 'string' });

const ROUTE = '/internal/mcp/machine-grants';

/**
 * Calls be-01's machine grant route with `MCP_BE_INTERNAL_SECRET` in
 * `x-mcp-internal-auth` (M14), never `x-internal-auth`. The key or assertion
 * goes in the JSON body alone; no error this client raises carries the body.
 */
export function machineGrantClient(
  config: {
    readonly WBS_API_URL: string;
    readonly WBS_BASIC_AUTH?: string;
    readonly MCP_BE_INTERNAL_SECRET: string;
  },
  fetchImpl: FetchLike = fetch,
): MachineGrantClient {
  const url = `${config.WBS_API_URL.replace(/\/+$/, '')}${ROUTE}`;
  return {
    async issue(request) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            // Proof: sending it as x-internal-auth failed `sends the key with the dedicated
            // secret…` (machine-token.test.ts); watched 2026-10-27.
            [MCP_INTERNAL_SECRET_HEADER]: config.MCP_BE_INTERNAL_SECRET,
            'content-type': 'application/json',
            ...(config.WBS_BASIC_AUTH === undefined
              ? {}
              : {
                  'proxy-authorization': `Basic ${Buffer.from(config.WBS_BASIC_AUTH, 'utf8').toString('base64')}`,
                }),
          },
          body: JSON.stringify({
            issuer: request.issuer,
            credential:
              request.credential.kind === 'api_key'
                ? { kind: 'api_key', key: request.credential.key.reveal() }
                : { kind: 'oidc', assertion: request.credential.assertion.reveal() },
            expiresAt: request.expiresAt,
            ...(request.run === null ? {} : { run: request.run }),
          }),
        });
      } catch (cause) {
        // An unreachable be-01 is fetch's TypeError; anything else is a local defect.
        // Proof: rethrowing failed `answers 503 temporarily_unavailable when be-01 fails or cannot
        // be reached` (machine-token.test.ts); watched 2026-10-27.
        if (cause instanceof TypeError) return { kind: 'unavailable' };
        throw cause;
      }
      const text = await response.text();
      if (response.status === 200) return { kind: 'issued', ...parsedIssued(text) };
      // Proof: with this removed, `answers 503 temporarily_unavailable…` (machine-token.test.ts)
      // threw a defect; watched 2026-10-27.
      if (response.status >= 500) return { kind: 'unavailable' };
      const refusal = refusalOf(text);
      const oidc = request.credential.kind === 'oidc';
      // be-01's refusals of the presented source (`unknown_identity`; for an
      // assertion also `invalid_token`) and `not_activated`, all one answer.
      if (
        // Proof: admitting invalid_token for a key, or dropping not_activated, failed `throws a
        // defect, never a refusal…` (machine-token.test.ts) and the pre-activation test
        // (machine-token.boot.test.ts); watched 2026-10-27.
        (response.status === 401 &&
          (refusal?.error === 'unknown_identity' ||
            (oidc && refusal?.error === 'invalid_token'))) ||
        (response.status === 409 && refusal?.error === 'not_activated')
      )
        return { kind: 'refused' };
      if (
        // Proof: reading the typ refusal for a key failed `throws a defect, never a refusal…`
        // (machine-token.test.ts); watched 2026-10-27.
        oidc &&
        response.status === 401 &&
        refusal?.error === 'unsupported_assertion_type' &&
        refusal.typ !== undefined
      )
        return { kind: 'unsupported_assertion_type', typ: refusal.typ };
      // be-01's only `invalid_body` for a body mcp-01 built is a run shaped like a secret.
      // Proof: without the run condition `throws a defect, never a refusal…`
      // (machine-token.test.ts) answered invalid_request; watched 2026-10-27.
      if (response.status === 400 && refusal?.error === 'invalid_body' && request.run !== null)
        return { kind: 'run_refused' };
      throw new MachineGrantDefect(
        `be-01 ${ROUTE} answered unmodeled HTTP ${String(response.status)}${refusal === null ? '' : ` ${refusal.error}`}`,
      );
    },
  };
}

function parsedIssued(text: string): Omit<IssuedMachineGrant, 'kind'> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new MachineGrantDefect(`be-01 ${ROUTE} answered non-JSON`, { cause });
  }
  const issued = ISSUED(value);
  // Proof: skipping this check made `throws a defect, never a refusal…` (machine-token.test.ts)
  // answer invalid_scope for scopes ['admin']; watched 2026-10-27.
  if (issued instanceof type.errors)
    // The fields' names only: a summary quotes values, and the body holds the grant.
    throw new MachineGrantDefect(
      `be-01 ${ROUTE} answered an unexpected shape at ${[...new Set(issued.map((error) => error.path.join('.')))].join(', ')}`,
    );
  return issued;
}

function refusalOf(text: string): typeof REFUSAL.infer | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    if (cause instanceof SyntaxError) return null;
    throw cause;
  }
  const refusal = REFUSAL(value);
  return refusal instanceof type.errors ? null : refusal;
}
