import type { WbsScope } from '@wbs/contracts';
import { type } from '@wbs/validation';

import type { McpConfig } from './config';
import type { McpRefreshAuthorityReader } from './refresh-authority';
import type { FetchLike } from './wbs-client';

/** One organization an MCP consent may bind, as be-01 listed it. */
export interface OrganizationChoice {
  readonly organizationId: string;
  readonly name: string;
  readonly role: 'super_admin' | 'admin' | 'member' | 'viewer';
}

/** What a consent binds: nothing before activation, else one of these memberships. */
export type ConsentOrganizations =
  | { readonly kind: 'pre_activation' }
  | {
      readonly kind: 'activated';
      readonly userId: string;
      readonly memberships: readonly OrganizationChoice[];
    }
  /** be-01 refused the freshly verified upstream token, e.g. linked to nobody. */
  | { readonly kind: 'refused' };

/** One bound session call's delegation request, from mcp-01's own durable family. */
export interface DelegationRequest {
  readonly organizationId: string;
  readonly userId: string;
  readonly client: string;
  readonly grant: string;
  readonly scopes: readonly WbsScope[];
}

/**
 * be-01's answer to one delegation request:
 * - `issued`: a single-use bearer for exactly one be-01 call;
 * - `upstream_rejected`: the upstream token no longer verifies, so refresh and retry;
 * - `membership_ended`: the bound user left the organization or no longer owns the
 *   upstream identity, so the session must end;
 * - `refused`: an organization rule (enforced SSO, session policy, scope) refuses
 *   this call, with be-01's body for the caller to read.
 */
export type DelegationOutcome =
  | { readonly kind: 'issued'; readonly token: string }
  | { readonly kind: 'upstream_rejected' | 'membership_ended' }
  | { readonly kind: 'refused'; readonly status: number; readonly body: string };

/** mcp-01's client for be-01's three MCP delegation routes. */
export interface OrganizationAuthority {
  organizationsFor(upstreamToken: string): Promise<ConsentOrganizations>;
  delegationFor(upstreamToken: string, request: DelegationRequest): Promise<DelegationOutcome>;
  readonly readRefreshAuthority: McpRefreshAuthorityReader;
}

const ERROR_BODY = type({ error: 'string' });
const ORGANIZATIONS = type({ state: "'pre_activation'" }).or({
  state: "'activated'",
  userId: 'string',
  memberships: type({
    organizationId: 'string',
    name: 'string',
    role: "'super_admin' | 'admin' | 'member' | 'viewer'",
  }).array(),
});
const DELEGATION = type({ token: 'string' });
const AUTHORITY = type({ outcome: "'denied'" }).or({
  outcome: "'admitted'",
  issuer: 'string',
  subject: 'string',
  userId: 'string',
  organizationId: 'string',
  enforced: type({ prefix: 'string', loginSlug: 'string' }).array(),
  policy: type({
    maxSessionSeconds: 'number | null',
    reauthenticateAfterSeconds: 'number | null',
  }).or('null'),
});

/** be-01 answered something this release does not model: a deployment defect, never a refusal. */
export class OrganizationAuthorityDefect extends Error {}

/**
 * Calls be-01's `/internal/mcp/*` routes with the deployment's internal
 * service secret and, where the route verifies a user, the user's own
 * upstream access token. Every answer is validated here, at the boundary;
 * an unmodeled status or body throws {@link OrganizationAuthorityDefect}.
 */
export function organizationAuthority(
  config: Pick<McpConfig, 'WBS_API_URL' | 'WBS_BASIC_AUTH'> & {
    readonly INTERNAL_AUTH_SECRET: string;
  },
  fetchImpl: FetchLike = fetch,
): OrganizationAuthority {
  const base = config.WBS_API_URL.replace(/\/+$/, '');
  const post = (path: string, body: unknown, upstreamToken?: string) =>
    fetchImpl(`${base}/internal/mcp/${path}`, {
      method: 'POST',
      headers: {
        'x-internal-auth': config.INTERNAL_AUTH_SECRET,
        ...(upstreamToken === undefined ? {} : { authorization: `Bearer ${upstreamToken}` }),
        ...(config.WBS_BASIC_AUTH === undefined
          ? {}
          : {
              'proxy-authorization': `Basic ${Buffer.from(config.WBS_BASIC_AUTH, 'utf8').toString('base64')}`,
            }),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  return {
    async organizationsFor(upstreamToken) {
      const response = await post('organizations', undefined, upstreamToken);
      const text = await response.text();
      if (response.status === 401 && errorOf(text) !== 'unauthorized') return { kind: 'refused' };
      if (response.status !== 200) throw unmodeled('organizations', response.status, text);
      const listed = parsed(ORGANIZATIONS, text, 'organizations');
      return listed.state === 'pre_activation'
        ? { kind: 'pre_activation' }
        : { kind: 'activated', userId: listed.userId, memberships: listed.memberships };
    },

    async delegationFor(upstreamToken, request) {
      const response = await post(
        'delegation',
        {
          organizationId: request.organizationId,
          userId: request.userId,
          client: request.client,
          grant: request.grant,
          scope: request.scopes.join(' '),
        },
        upstreamToken,
      );
      const text = await response.text();
      if (response.status === 200)
        return { kind: 'issued', token: parsed(DELEGATION, text, 'delegation').token };
      const error = errorOf(text);
      // `unauthorized` is mcp-01's own service secret, a deployment defect.
      if (response.status === 401 && error !== 'unauthorized') return { kind: 'upstream_rejected' };
      if (response.status === 403 && (error === 'not_a_member' || error === 'binding_changed'))
        return { kind: 'membership_ended' };
      if (
        response.status === 403 &&
        (error === 'sso_required' ||
          error === 'reauthentication_required' ||
          error === 'insufficient_scope')
      )
        return { kind: 'refused', status: response.status, body: text };
      // `delegation_inactive` after a bound consent, `no_active_organization`
      // for a delegation, or anything else: trusted state this release did
      // not produce.
      throw unmodeled('delegation', response.status, text);
    },

    readRefreshAuthority: async (authority) => {
      let response: Response;
      try {
        response = await post('authority', {
          issuer: authority.binding.issuer,
          subject: authority.subject,
          userId: authority.binding.userId,
          organizationId: authority.binding.organizationId,
        });
      } catch (cause) {
        // A be-01 that cannot be reached cannot confirm authority: the
        // family is kept and the caller is told to retry.
        if (cause instanceof TypeError) return { outcome: 'unavailable' };
        throw cause;
      }
      const text = await response.text();
      if (response.status >= 500) return { outcome: 'unavailable' };
      if (response.status !== 200) throw unmodeled('authority', response.status, text);
      const read = parsed(AUTHORITY, text, 'authority');
      // Proof: answering admitted for be-01's denial made `a removed member's
      // session is refused on its next call and cannot refresh` in
      // `organization-delegation.boot.test.ts` answer 200; watched 2026-10-21.
      if (read.outcome === 'denied') return { outcome: 'denied' };
      return {
        outcome: 'admitted',
        // be-01 echoes the identity it verified; the family's own fields are
        // mcp-01's and pass through for the caller's exact comparison.
        authority: {
          ...authority,
          subject: read.subject,
          binding: {
            organizationId: read.organizationId,
            userId: read.userId,
            issuer: read.issuer,
          },
        },
        facts: { enforced: read.enforced, policy: read.policy, lifecycle: null },
      };
    },
  };
}

function errorOf(text: string): string | undefined {
  try {
    const body = ERROR_BODY(JSON.parse(text));
    return body instanceof type.errors ? undefined : body.error;
  } catch (cause) {
    if (cause instanceof SyntaxError) return undefined;
    throw cause;
  }
}

function parsed<T>(
  schema: (input: unknown) => T | InstanceType<typeof type.errors>,
  text: string,
  route: string,
): T {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new OrganizationAuthorityDefect(`be-01 /internal/mcp/${route} answered non-JSON`, {
      cause,
    });
  }
  const checked = schema(value);
  if (checked instanceof type.errors)
    throw new OrganizationAuthorityDefect(
      `be-01 /internal/mcp/${route} answered an unexpected shape: ${checked.summary}`,
    );
  return checked;
}

function unmodeled(route: string, status: number, text: string): OrganizationAuthorityDefect {
  return new OrganizationAuthorityDefect(
    `be-01 /internal/mcp/${route} answered unmodeled HTTP ${String(status)}`,
    { cause: text },
  );
}
