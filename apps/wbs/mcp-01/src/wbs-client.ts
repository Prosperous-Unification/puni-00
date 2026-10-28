import {
  DEPENDENCY_SEMANTICS,
  DEPENDENCY_SEMANTICS_HEADER,
  requiresDependencyOperation,
} from '@wbs/contracts/dependency-claim';
import { defineException } from 'application-exception';

import type { McpConfig } from './config';
import type { DerivedTool } from './openapi-tools';

/**
 * One tool call → one HTTP request to be-01, and back.
 *
 * Two rules shape this file, and both are refusals rather than conveniences.
 *
 * An input the operation does not declare **throws** (R5, task 3.1). The
 * alternative is forwarding it: a mistyped `parentId` lands in a body be-01
 * strips before the handler runs, the write succeeds having done something
 * else, and the caller is told it worked.
 *
 * A refused request comes back as a tool error carrying be-01's own code
 * verbatim (D7). `number_is_derived` and `has_children` are the vocabulary an
 * agent corrects itself with; "the request failed" is the vocabulary it gives
 * up on.
 */

export interface ToolTextResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly isError?: true;
}

export interface WbsRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

/** The slice of `fetch` this module uses, so a test can pass a stub. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    redirect?: RequestRedirect;
    signal?: AbortSignal;
  },
) => Promise<Response>;

/**
 * How long one tool call waits for be-01, answer and body together: past be-01's own bound.
 * be-01 serves through Elysia, whose Bun server closes a connection idle for 30 s (Elysia's
 * `idleTimeout` default; be-01 sets none), and its long work (solver runs, optimization) runs
 * in the background rather than inside a request. So a call still waiting at 35 s is not one
 * be-01 is finishing. Without a bound, a hung be-01 would hold the caller's in-flight slot
 * (`wbs-mcp-agent-surface` M10) for ever.
 */
export const BE_CALL_TIMEOUT_MS = 35_000;

/**
 * be-01 did not answer a tool call within {@link BE_CALL_TIMEOUT_MS}. Not the caller's
 * credential and not a network error (a `TimeoutError` carries no system error code): the
 * call is reported as an unexpected failure and answered a tool error, never a 401.
 */
export class BeCallTimedOut extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BeCallTimedOut';
  }
}

/** The MCP request was cancelled while its tool call waited for be-01: a controlled exit. */
export class ToolCallCancelled extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolCallCancelled';
  }
}

/**
 * `work` raced against `signal`: it rejects with the signal's reason once the signal aborts,
 * even when `work` itself never settles (a fetch that ignores its signal).
 */
export async function untilAborted<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  let stop: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    const abort = () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    };
    if (signal.aborted) abort();
    signal.addEventListener('abort', abort, { once: true });
    stop = () => {
      signal.removeEventListener('abort', abort);
    };
  });
  try {
    return await Promise.race([work(), aborted]);
  } finally {
    stop?.();
  }
}

/**
 * be-01 rejected the caller credential with a 401, so a consent session must end. `code` is
 * be-01's own error code when its body carried one; a machine caller's call is judged by it
 * (`wbs-mcp-agent-surface` M3), never by the message.
 */
export class UpstreamRejected extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'UpstreamRejected';
  }
}

/**
 * The MCP session cannot be refreshed and its family is already ended: the session is missing,
 * expired or revoked, or the identity provider refused the refresh. A modeled session outcome,
 * never an operator failure; any other refresh rejection is unexpected.
 */
export class SessionRefreshRefused extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SessionRefreshRefused';
  }
}

/**
 * be-01 refused the organization delegation for this call, a modeled outcome
 * the caller reads. `endsSession` when the bound membership or identity is
 * gone: the family is already revoked and the caller must reauthorize.
 */
export class DelegationRefused extends Error {
  constructor(
    message: string,
    readonly endsSession: boolean,
  ) {
    super(message);
    this.name = 'DelegationRefused';
  }
}

/** The configured Basic edge gate rejected the deployment credential. */
export class EdgeGate extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeGate';
  }
}

type ToolInputRefusalDetails =
  | {
      readonly kind: 'undeclared_input';
      readonly toolName: string;
      readonly inputName: string;
      readonly declaredNames: readonly string[];
    }
  | {
      readonly kind: 'missing_path';
      readonly toolName: string;
      readonly parameterName: string;
      readonly path: string;
    }
  | {
      readonly kind: 'non_scalar_url';
      readonly toolName: string;
      readonly parameterName: string;
      readonly location: 'path' | 'query';
      readonly receivedType: string;
    }
  | {
      readonly kind: 'dot_segment';
      readonly toolName: string;
      readonly parameterName: string;
    }
  | {
      readonly kind: 'route_changed';
      readonly toolName: string;
      readonly path: string;
    };

function toolInputRefusalMessage(details: ToolInputRefusalDetails): string {
  switch (details.kind) {
    case 'undeclared_input': {
      const declared =
        details.declaredNames.length === 0 ? 'no inputs' : details.declaredNames.join(', ');
      return `${details.toolName} does not declare an input named "${details.inputName}". It declares ${declared}. be-01 strips unknown properties before the handler runs, so forwarding it would look like a success that did something else.`;
    }
    case 'missing_path':
      return `${details.toolName} needs the path parameter "${details.parameterName}" and it was not given, so ${details.path} cannot be built.`;
    case 'non_scalar_url':
      return `${details.toolName}: ${details.location} parameter "${details.parameterName}" must be a string, number or boolean; received ${details.receivedType}. Every ${details.location} parameter be-01 declares is scalar.`;
    case 'dot_segment':
      return `${details.toolName}: path parameter "${details.parameterName}" must not be empty, "." or "..", which would change the route ${details.toolName} calls rather than name a row.`;
    case 'route_changed':
      return `${details.toolName}: the path parameters would send this call to another route than ${details.path}, so it was not sent.`;
    default: {
      const unreachable: never = details;
      throw new Error(`Unknown tool input refusal: ${String(unreachable)}`);
    }
  }
}

/** A tool input mcp-01 can explain and the caller can correct. */
export const ToolInputRefused = defineException({
  tag: 'wbs/mcp/ToolInputRefused',
  message: (details: ToolInputRefusalDetails) => toolInputRefusalMessage(details),
});

const text = (value: string, isError?: true): ToolTextResult => ({
  content: [{ type: 'text', text: value }],
  ...(isError === undefined ? {} : { isError }),
});

/**
 * A value be-01 can receive in a URL. Every path and query parameter the
 * document declares is scalar, and an object stringified into one arrives as
 * the literal `[object Object]` — a 404 that reads like a missing row.
 */
const asUrlValue = (
  tool: DerivedTool,
  name: string,
  value: unknown,
  location: 'path' | 'query',
): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // Proof: on 2026-09-21, replacing this owner-local kind with plain Error made the three
  // “models” cases pass twice and fail the non-scalar case on `toBeInstanceOf(ToolInputRefused)`.
  throw new ToolInputRefused({
    details: {
      kind: 'non_scalar_url',
      toolName: tool.name,
      parameterName: name,
      location,
      receivedType: typeof value,
    },
  });
};

/**
 * Tool input → the request that carries it, by the operation's own locations.
 *
 * @throws {ToolInputRefused} if an input is undeclared, a path parameter is missing, or a URL
 * value is not scalar. The first has nowhere to go; the second leaves a literal `{id}` that
 * be-01 answers 404 to as if the row were gone; the third would become `[object Object]`.
 * Also if a path value is empty, `.` or `..`, or the URL would not parse back to the expanded
 * template: either would send the call to another route.
 *
 * `serviceHeaders` are mcp-01's own (a machine caller's `x-mcp-internal-auth`), sent beside the
 * caller's bearer.
 */
export function buildRequest(
  tool: DerivedTool,
  input: Readonly<Record<string, unknown>>,
  config: McpConfig,
  callerToken?: string,
  serviceHeaders: Readonly<Record<string, string>> = {},
): WbsRequest {
  const query = new URLSearchParams();
  const body: Record<string, unknown> = {};
  const pathValues = new Map<string, string>();

  for (const [name, value] of Object.entries(input)) {
    // `Object.hasOwn`, not a lookup-and-compare: this repo does not run
    // `noUncheckedIndexedAccess`, so an index read types as present whether or
    // not it is, and the check below would be a branch the compiler thinks dead.
    const location = Object.hasOwn(tool.locations, name) ? tool.locations[name] : undefined;
    if (location === undefined) {
      throw new ToolInputRefused({
        details: {
          kind: 'undeclared_input',
          toolName: tool.name,
          inputName: name,
          declaredNames: Object.keys(tool.locations),
        },
      });
    }
    // An explicit `undefined` is the caller leaving an optional input out, not
    // a value to send. `null` is a value — be-01 clears a date with it.
    if (value === undefined) continue;
    if (location === 'path') pathValues.set(name, asUrlValue(tool, name, value, 'path'));
    else if (location === 'query') query.append(name, asUrlValue(tool, name, value, 'query'));
    else body[name] = value;
  }

  const path = tool.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = pathValues.get(name);
    if (value === undefined) {
      throw new ToolInputRefused({
        details: {
          kind: 'missing_path',
          toolName: tool.name,
          parameterName: name,
          path: tool.path,
        },
      });
    }
    // `encodeURIComponent` leaves `.` intact, so `..` would climb a segment once the URL is
    // parsed, and an empty value would merge two (`wbs-mcp-agent-surface` M14).
    // Proof: with this refusal removed, `refuses an empty, "." or ".." path value before any
    // be-01 request` (wbs-client.test.ts) sent `{..}` as `/api/claims`; watched 2026-10-27.
    if (value === '' || value === '.' || value === '..') {
      throw new ToolInputRefused({
        details: { kind: 'dot_segment', toolName: tool.name, parameterName: name },
      });
    }
    return encodeURIComponent(value);
  });

  const headers: Record<string, string> = {};
  // Proof: omitting this claim failed the protected tool/typed incompatibility test.
  if (requiresDependencyOperation(tool.name))
    headers[DEPENDENCY_SEMANTICS_HEADER] = DEPENDENCY_SEMANTICS;
  if (callerToken !== undefined) headers['authorization'] = `Bearer ${callerToken}`;
  if (config.WBS_BASIC_AUTH !== undefined) {
    // The deployment gate, not the caller. Bearer authentication owns the
    // Authorization header, so an upstream proxy credential uses its own field.
    headers['proxy-authorization'] =
      `Basic ${Buffer.from(config.WBS_BASIC_AUTH, 'utf8').toString('base64')}`;
  }

  // A body is sent when the operation declares body properties, even if the
  // caller supplied none: a PATCH with an empty object is a no-op the handler
  // answers for, while no body at all is a parse error it answers 400 to.
  const declaresBody = Object.values(tool.locations).includes('body');
  if (declaresBody) headers['content-type'] = 'application/json';

  const queryString = query.toString();
  const base = config.WBS_API_URL.replace(/\/+$/, '');
  const url = `${base}${path}${queryString === '' ? '' : `?${queryString}`}`;
  // The route is the template's, whatever a value holds: what is sent must parse back to the
  // expanded template, so no encoding gap can move the call (M14). be-01's routing stays the
  // second line, since a proxy may still normalise what is sent.
  // Proof: with the encoder replaced by the identity function, `x/../../claims` was refused
  // here by `refuses a value that would move the route` (wbs-client.test.ts), and reached
  // be-01's fake as `/api/claims` once this check was also removed; watched 2026-10-27.
  if (new URL(url).pathname !== `${new URL(base).pathname.replace(/\/+$/, '')}${path}`) {
    throw new ToolInputRefused({
      details: { kind: 'route_changed', toolName: tool.name, path: tool.path },
    });
  }
  return {
    method: tool.method.toUpperCase(),
    url,
    headers: { ...headers, ...serviceHeaders },
    ...(declaresBody ? { body: JSON.stringify(body) } : {}),
  };
}

/**
 * A non-2xx as a tool error (D7): the status, be-01's raw code, and the body it
 * came in, unedited.
 *
 * A 401 is two different faults wearing the same number, and the operator can
 * only fix one of them at a time. fe-01 learned this the hard way — see
 * `apps/wbs/fe-01/src/lib/api.ts`, where an edge challenge reported as `http_401`
 * sent a real person hunting through the app for a fault one layer above it.
 * `WWW-Authenticate` is the discriminator: a proxy sets it, be-01 never does.
 */
function refusal(
  tool: DerivedTool,
  response: Response,
  bodyText: string,
  config: McpConfig,
): ToolTextResult {
  const where = `${tool.method.toUpperCase()} ${tool.path}`;
  const trimmed = bodyText.trim();

  const challenge = response.headers.get('www-authenticate');
  if (response.status === 401 && challenge !== null && /^\s*Basic(?:\s|$)/i.test(challenge)) {
    const remedy =
      config.WBS_BASIC_AUTH === undefined
        ? "Set WBS_BASIC_AUTH to the deployment's user:pass and restart mcp-01."
        : 'Check that WBS_BASIC_AUTH matches the deployment gate credential and restart mcp-01.';
    throw new EdgeGate(
      `${tool.name} was refused by the deployment's own gate, not by be-01: HTTP 401 with a WWW-Authenticate challenge on ${where}. The request never reached the API. ${remedy}`,
    );
  }

  let code: string | undefined;
  if (trimmed !== '') {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
        const value = (parsed as { error?: unknown }).error;
        if (typeof value === 'string') code = value;
      }
    } catch {
      // A non-JSON error body is a proxy page, and the status still means
      // something. Kept as the raw body below rather than thrown away.
    }
  }

  // The code is be-01's word, printed as it arrived. The body follows it whole,
  // because a refusal can carry more than the code — a 409 from the directory
  // delete names what still uses the row.
  const head = `${tool.name} was refused: HTTP ${String(response.status)}${
    code === undefined ? '' : ` ${code}`
  } from ${where}.`;
  if (response.status === 401) {
    throw new UpstreamRejected(
      `${head} The caller access token is expired, invalid, or lacks the issuer/audience be-01 trusts.${trimmed === '' ? '' : `\n${trimmed}`}`,
      code,
    );
  }
  return text(`${head}${trimmed === '' ? '' : `\n${trimmed}`}`, true);
}

/**
 * Calls be-01 for one derived tool.
 *
 * @throws {ToolInputRefused} if the request cannot be built from correctable local input.
 * @throws {Error} if a response outside 2xx and 4xx arrives, or if a successful body is not
 * JSON. Coercing malformed success to `{}` would report an empty plan as the plan (task 3.4).
 * A 204 with no body is not that case — it is what be-01's deletes answer with.
 */
export async function callTool(
  tool: DerivedTool,
  input: Readonly<Record<string, unknown>>,
  config: McpConfig,
  fetchImpl: FetchLike = fetch,
  callerToken?: string,
  serviceHeaders: Readonly<Record<string, string>> = {},
  call: { readonly cancel?: AbortSignal; readonly timeoutMs?: number } = {},
): Promise<ToolTextResult> {
  const request = buildRequest(tool, input, config, callerToken, serviceHeaders);
  const timeout = AbortSignal.timeout(call.timeoutMs ?? BE_CALL_TIMEOUT_MS);
  const signal = call.cancel === undefined ? timeout : AbortSignal.any([timeout, call.cancel]);
  let response: Response;
  let bodyText: string;
  try {
    // Proof: with the race removed (the signal only handed to a fetch that ignores it), `frees
    // the in-flight slot of a call be-01 never answers, after the timeout` (machine-limits.test.ts)
    // and `throws BeCallTimedOut for a call be-01 never answers…` (wbs-client.test.ts) hung;
    // watched 2026-10-27.
    [response, bodyText] = await untilAborted(signal, async () => {
      const answered = await fetchImpl(request.url, {
        method: request.method,
        headers: { ...request.headers },
        // A redirect is never followed: the caller's bearer and mcp-01's secret would go with it
        // to wherever it points. A 3xx is then an unexpected answer, reported below.
        // Proof: following redirects made `never follows a redirect, so the secret stays with
        // be-01` (wbs-client.test.ts) see the secret at the other origin; watched 2026-10-27.
        redirect: 'manual',
        signal,
        ...(request.body === undefined ? {} : { body: request.body }),
      });
      return [answered, await answered.text()] as const;
    });
  } catch (cause) {
    // Proof: rethrowing the TimeoutError itself failed the same two tests' BeCallTimedOut
    // expectation; watched 2026-10-27.
    if (timeout.aborted)
      throw new BeCallTimedOut(
        `${tool.name}: be-01 did not answer ${tool.method.toUpperCase()} ${tool.path} within ${String((call.timeoutMs ?? BE_CALL_TIMEOUT_MS) / 1_000)} s.`,
      );
    // Proof: without this mapping, `throws BeCallTimedOut… and ToolCallCancelled once cancelled`
    // (wbs-client.test.ts) saw the raw abort; watched 2026-10-27.
    if (call.cancel?.aborted === true)
      throw new ToolCallCancelled(`${tool.name} was cancelled before be-01 answered.`);
    throw cause;
  }

  if (!response.ok) {
    // Proof: on 2026-09-21, widening this upper bound to 599 sent a secret-bearing 500 through
    // refusal, exposed its body as tool content, and skipped the unexpected reporter.
    if (response.status >= 400 && response.status <= 499) {
      return refusal(tool, response, bodyText, config);
    }
    throw new Error(
      `${tool.name}: be-01 answered unexpected HTTP ${String(response.status)} from ${tool.method.toUpperCase()} ${tool.path}.`,
      { cause: bodyText },
    );
  }

  if (bodyText.trim() === '') {
    return text(`${tool.name}: HTTP ${String(response.status)}, no content.`);
  }
  try {
    JSON.parse(bodyText);
  } catch (cause) {
    throw new Error(
      `${tool.name}: be-01 answered HTTP ${String(response.status)} with a body that is not JSON (${String(bodyText.length)} characters, starting "${bodyText.slice(0, 60)}"). Something between mcp-01 and the API answered instead of it.`,
      { cause },
    );
  }
  // Passed through as it arrived. Re-serialising would reorder keys and drop
  // the shape be-01's own tests assert on.
  return text(bodyText);
}
