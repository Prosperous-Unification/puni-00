import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import type { McpConfig } from './config';
import { McpDeploymentFault } from './deployment-fault';
import { MachineCaller } from './machine-admission';
import type { DerivedTool } from './openapi-tools';
import type { UnexpectedToolFailureReporter } from './unexpected-tool-failure';
import type { FetchLike, ToolTextResult } from './wbs-client';
import {
  callTool,
  DelegationRefused,
  EdgeGate,
  SessionRefreshRefused,
  ToolInputRefused,
  UpstreamRejected,
} from './wbs-client';

/**
 * The three pieces composed: the tools section 2 derives, the call section 3
 * makes, and an MCP `Server` that hands one to the other. The choice of the
 * low-level `Server` over `McpServer`, and what it costs, is on `createServer`.
 */

/**
 * The version this server reports to its client. The monorepo's root
 * `package.json` is `0.0.0` and no app carries its own, but the protocol wants a
 * string, so this is mcp-01's own number and moves by hand.
 */
export const SERVER_VERSION = '0.1.0';

/**
 * D9, as a sentence a caller can act on.
 *
 * A write returns what be-01 returned, and be-01 returns the row it touched —
 * not the plan. Numbers, dates, floats and slices are recomputed from the tree
 * on every read, so one patch can move dates the response never mentions.
 */
const REREAD_AFTER_WRITE =
  'Numbers, dates, floats and slices are derived from the tree and re-derived on every read, so this result is not the new state of the plan — one write can move dates it does not mention. Re-read the project’s work items afterwards.';

/**
 * Does the operation's own prose already say numbers are derived and re-read?
 *
 * Four of be-01's write operations do (the hand-written bodies on `POST
 * /api/projects/{id}/work-items`, `PATCH /api/work-items/{id}`, `POST
 * /api/work-items/{id}/move` and `PUT …/progress/{stepId}`). Appending D9's
 * sentence to those would print the same warning twice in the same description,
 * in two different wordings — which reads as two different rules.
 */
const SAYS_IT_ALREADY = /re-?read|re-?derive|derived from the tree|recomput/i;

/**
 * The description a client sees: the document's prose, plus D9's warning on a
 * write that does not already carry one.
 *
 * Sourced rather than appended (task 4.3). Where be-01 says it, be-01's wording
 * wins — it is the API's own documentation, and mcp-01 paraphrasing it is how
 * the two drift.
 */
export function describeTool(tool: DerivedTool): string {
  if (tool.method === 'get') return tool.description;
  if (SAYS_IT_ALREADY.test(tool.description)) return tool.description;
  return `${tool.description}\n\n${REREAD_AFTER_WRITE}`;
}

export interface ServerDeps {
  readonly tools: readonly DerivedTool[];
  readonly config: McpConfig;
  /** Injectable for the round trip in `server.test.ts`; production passes none. */
  readonly fetchImpl?: FetchLike;
  readonly callerTokenOf?: (authInfo: { readonly token: string } | undefined) => string;
  readonly endSession?: (mcpSessionId: string) => void | Promise<void>;
  readonly refreshSession?: (mcpSessionId: string) => Promise<string>;
  /**
   * The credential one be-01 call carries for this session: a fresh signed
   * organization delegation for a bound session, else the upstream token.
   * Absent, the upstream token is forwarded as it is.
   */
  readonly bearerFor?: (
    mcpSessionId: string | null,
    upstreamToken: string,
    scopes: readonly string[],
  ) => Promise<string>;
  readonly reportUnexpectedToolFailure: UnexpectedToolFailureReporter;
}

const errorText = (message: string): ToolTextResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

/**
 * A `ToolTextResult` as the SDK's `CallToolResult`.
 *
 * Ours is `readonly`, and the SDK's result type is a union with a task-shaped
 * member the compiler falls through to when the readonly one does not fit — the
 * error it prints is "property 'task' is missing", which is not the fault. One
 * copy, and the shape matches.
 */
const asCallToolResult = (
  result: ToolTextResult,
): { content: { type: 'text'; text: string }[]; isError?: true } => ({
  content: result.content.map((part) => ({ ...part })),
  ...(result.isError === undefined ? {} : { isError: result.isError }),
});

/**
 * An MCP server answering `tools/list` and `tools/call` for the derived tools.
 *
 * Not connected to a transport — `main.ts` does that, and the test connects it
 * to an in-memory pair instead.
 *
 * **`Server` is deprecated (still so in 1.31.0) and used anyway**, which the two disable
 * comments below say at the point of use. The deprecation's own words are "Only
 * use `Server` for advanced use cases"; this is one. `McpServer.registerTool`
 * types `inputSchema` as `ZodRawShapeCompat | AnySchema` — checked against the
 * installed SDK, not remembered — so the high-level API would mean authoring all
 * schemas a second time in zod beside the ones the shared document already gives
 * us: two sources for one contract, and zod as a third validator in a repo that
 * has settled on typebox and arktype. See design.md D5.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- D5, see above.
export function createServer(deps: ServerDeps): Server {
  const {
    tools,
    config,
    fetchImpl,
    callerTokenOf,
    endSession,
    refreshSession,
    bearerFor,
    reportUnexpectedToolFailure,
  } = deps;
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- D5, see above.
  const server = new Server(
    { name: 'mcp-01', version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: describeTool(tool),
      // The schema the document produced, passed through (D5). Spread because
      // the SDK's type wants mutable properties and ours are `readonly`.
      inputSchema: { ...tool.inputSchema },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = byName.get(request.params.name);

    // A name that is not a tool is not a failed call, it is a call that was
    // never made: a protocol error, so a client cannot read the reply as a
    // result. Returning empty content here would let a caller believe the
    // operation ran and returned nothing.
    // Proof: on 2026-09-21, routing this McpError through the reporter returned tool content;
    // the linked client resolved instead of rejecting with InvalidParams.
    if (tool === undefined) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `mcp-01 has no tool named "${request.params.name}". It serves ${String(
          byName.size,
        )} tools derived from be-01's OpenAPI document; call tools/list for the current set.`,
      );
    }

    // be-01 checks the forwarded upstream token, which carries the account's full IdP groups, so
    // the narrower MCP grant is enforced here: a signed-in login is not write access, and a
    // refreshed token narrowed away from wbs:read does not read. Every non-GET be-01 operation
    // requires write scope (pinned by `the MCP grant scope` tests).
    // Proof: on 2026-09-27, disabling the write half failed both `the MCP grant scope` write
    // refusals (server.test.ts) and the omitted-scope and narrowed-scope mounted refusals
    // (oauth.test.ts); disabling the read half failed `refuses a read tool to a caller without
    // wbs:read`.
    const requiredScope = tool.method === 'get' ? 'read' : 'write';
    if (extra.authInfo?.scopes.includes(requiredScope) !== true) {
      return asCallToolResult(
        errorText(
          `${tool.name} could not be called: insufficient_scope. This MCP authorization does not include wbs:${requiredScope}; reauthorize requesting scope "wbs:read wbs:write".`,
        ),
      );
    }

    const authInfo = extra.authInfo;
    const machine = machineCallerOf(authInfo);
    // A machine token's calls carry its grant and mcp-01's secret, never a session's delegation
    // or the access token itself (M3, M14).
    // Proof: with this branch removed, `presents the grant with the secret, and never the access
    // token` (machine-admission.test.ts) saw be-01 asked with no secret, and five more tests
    // there failed; watched 2026-10-27.
    if (machine !== null)
      return await callAsMachine(tool, request.params.arguments ?? {}, machine, authInfo.token);
    const sessionOfCall = extraSessionId(authInfo);
    // One be-01 call with the credential `upstreamToken` stands behind: asked
    // afresh each time, because a delegation is good for exactly one call.
    const callWith = async (upstreamToken: string) =>
      callTool(
        tool,
        request.params.arguments ?? {},
        config,
        fetchImpl,
        bearerFor === undefined
          ? upstreamToken
          : await bearerFor(sessionOfCall, upstreamToken, authInfo.scopes),
      );
    try {
      return asCallToolResult(
        await callWith(callerTokenOf === undefined ? authInfo.token : callerTokenOf(authInfo)),
      );
    } catch (firstCause) {
      let cause = firstCause;
      if (firstCause instanceof UpstreamRejected) {
        const sessionId = sessionOfCall;
        let refreshedToken: string | null = null;
        if (sessionId !== null && refreshSession !== undefined) {
          try {
            refreshedToken = await refreshSession(sessionId);
          } catch (refreshCause) {
            if (refreshCause instanceof EdgeGate)
              return asCallToolResult(errorText(refreshCause.message));
            // A refused refresh ends the family below. Any other rejection (the session store
            // throwing while the family is looked up) is reported below and the session is kept:
            // the failure is mcp-01's, not a verdict on the caller's credential.
            // Proof: on 2026-09-27, removing this assignment failed `reports a refresh whose
            // session lookup throws, and keeps the session` on `Expected length: 1`, `Received
            // length: 0`: the session ended and no operator record was written.
            // Proof: on 2026-09-27, reporting every refresh rejection failed `keeps a refused
            // refresh modeled: the session ends and nothing is reported`.
            if (!(refreshCause instanceof SessionRefreshRefused)) cause = refreshCause;
          }
        }
        if (refreshedToken !== null) {
          try {
            // Proof: forwarding `refreshedToken` itself here made `keeps the signed
            // delegation through an upstream refresh retry` in
            // `organization-delegation.boot.test.ts` answer be-01's 403
            // no_active_organization; watched 2026-10-21.
            return asCallToolResult(await callWith(refreshedToken));
          } catch (retryCause) {
            // Only a second be-01 refusal is a session outcome. Anything else the retry throws is
            // classified below exactly as the first call's failure would be, so a transport or
            // decoder failure after a good refresh is reported and the session is kept.
            // Proof: on 2026-09-21, removing this assignment failed `reports a transport failure on
            // the retry after a refresh, and keeps the session` on `Expected length: 1`, `Received
            // length: 0`: a rejected retry fetch wrote no operator record.
            cause = retryCause;
          }
        }
        if (cause instanceof UpstreamRejected) {
          try {
            if (sessionId !== null) await endSession?.(sessionId);
          } catch (endCause) {
            // A session end that fails is reported below, and the result does not claim it ended.
            // Proof: on 2026-09-27, awaiting endSession outside this try failed `reports a session
            // end that rejects instead of failing the protocol call`: the client rejected with
            // `MCP error -32603` carrying the store's own message, and nothing was reported.
            return reportToolFailure(tool.name, endCause);
          }
          return asCallToolResult(
            errorText(
              sessionId === null
                ? `${tool.name} could not be called: ${cause.message} Sign in again and retry.`
                : `${tool.name} could not be called: be-01 rejected the upstream credential, so the MCP session ended. Reauthorize and retry.`,
            ),
          );
        }
      }
      if (cause instanceof DelegationRefused) {
        const sessionId = sessionOfCall;
        if (cause.endsSession && sessionId !== null) {
          try {
            await endSession?.(sessionId);
          } catch (endCause) {
            return reportToolFailure(tool.name, endCause);
          }
        }
        return asCallToolResult(errorText(`${tool.name} could not be called: ${cause.message}`));
      }
      if (cause instanceof EdgeGate) return asCallToolResult(errorText(cause.message));
      // Deliberately not a throw. A modeled input refusal names what the caller can correct — as
      // tool content a model reads it and tries again, as a protocol exception it mostly sees
      // "the call failed". be-01's own refusals already arrive this way (D7).
      // Proof: on 2026-09-21, bypassing this branch made undeclared input generic and called the
      // unexpected reporter instead of preserving the specific correction text.
      if (cause instanceof ToolInputRefused) {
        return asCallToolResult(errorText(`${tool.name} could not be called: ${cause.message}`));
      }
      return reportToolFailure(tool.name, cause);
    }
  });

  /**
   * One be-01 call for a machine caller, and what its refusal means (M3): `unknown_identity`
   * is the credential's refusal, the tool error `machine_credential_refused`, after which this
   * replica refuses the token; `unknown_grant_key` and `invalid_token` make the request
   * `401 invalid_token`, so the client re-fetches; any other 401, `internal_unauthorized`
   * included, is a deployment fault, reported and answered `502`.
   */
  async function callAsMachine(
    tool: DerivedTool,
    input: Readonly<Record<string, unknown>>,
    machine: MachineCaller,
    grant: string,
  ): Promise<ReturnType<typeof asCallToolResult>> {
    try {
      return asCallToolResult(
        await callTool(tool, input, config, fetchImpl, grant, machine.serviceHeaders()),
      );
    } catch (cause) {
      if (cause instanceof UpstreamRejected) {
        // Proof: with `credentialRefused()` dropped here, `answers the call after a revocation
        // commits machine_credential_refused, then 401…` (machine-admission.test.ts) answered
        // the next request 200; entering the secret fault below as well failed `answers a
        // missing or wrong secret 502…, and keeps the token once the secret is fixed`;
        // watched 2026-10-27.
        if (cause.code === 'unknown_identity') {
          machine.credentialRefused();
          return asCallToolResult(
            errorText(
              `${tool.name} could not be called: machine_credential_refused. be-01 refused this machine credential: it is revoked, expired, or its person is no longer bound to a member. A new token is refused the same way until an admin issues a credential.`,
            ),
          );
        }
        // Proof: answering these as tool errors (`grantRejected()` dropped) failed `answers a
        // grant be-01 cannot verify 401 invalid_token, so the client re-fetches`
        // (machine-admission.test.ts) with 200; watched 2026-10-27.
        if (cause.code === 'unknown_grant_key' || cause.code === 'invalid_token') {
          machine.grantRejected();
          return asCallToolResult(
            errorText(`${tool.name} could not be called: invalid_token. Fetch a new token.`),
          );
        }
        machine.deploymentFault(
          new McpDeploymentFault(
            `be-01 answered a machine call to ${tool.method.toUpperCase()} ${tool.path} HTTP 401 ${cause.code ?? 'without a code'}`,
          ),
        );
        return asCallToolResult(errorText(`${tool.name} could not be called: server_error.`));
      }
      if (cause instanceof EdgeGate) return asCallToolResult(errorText(cause.message));
      if (cause instanceof ToolInputRefused)
        return asCallToolResult(errorText(`${tool.name} could not be called: ${cause.message}`));
      return reportToolFailure(tool.name, cause);
    }
  }

  function reportToolFailure(
    toolName: string,
    caught: unknown,
  ): ReturnType<typeof asCallToolResult> {
    // Proof: on 2026-09-21, replacing this call with a fabricated disclosure left the linked
    // SDK reporter count at zero; invoking it twice made the production exact-one count two.
    const disclosure = reportUnexpectedToolFailure(caught);
    return asCallToolResult(
      errorText(
        // Proof: on 2026-09-21, replacing this format with fixed synthetic public text preserved
        // reporter safety but failed the exact generic sentence and correlation envelope.
        `${toolName} could not be called: ${disclosure.sentence}. Reference ${disclosure.occurrenceId}.`,
      ),
    );
  }

  return server;
}

function machineCallerOf(authInfo: unknown): MachineCaller | null {
  if (typeof authInfo !== 'object' || authInfo === null || !('extra' in authInfo)) return null;
  const extra = authInfo.extra;
  if (typeof extra !== 'object' || extra === null || !('machine' in extra)) return null;
  return extra.machine instanceof MachineCaller ? extra.machine : null;
}

function extraSessionId(authInfo: unknown): string | null {
  if (typeof authInfo !== 'object' || authInfo === null || !('extra' in authInfo)) return null;
  const extra = authInfo.extra;
  if (typeof extra !== 'object' || extra === null || !('mcpSessionId' in extra)) return null;
  return typeof extra.mcpSessionId === 'string' ? extra.mcpSessionId : null;
}
