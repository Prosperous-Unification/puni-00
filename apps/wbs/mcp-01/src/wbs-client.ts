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
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<Response>;

/** be-01 rejected the caller credential, so its local MCP session must end. */
export class UpstreamRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamRejected';
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
 */
export function buildRequest(
  tool: DerivedTool,
  input: Readonly<Record<string, unknown>>,
  config: McpConfig,
  callerToken?: string,
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
    return encodeURIComponent(value);
  });

  const headers: Record<string, string> = {};
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
  return {
    method: tool.method.toUpperCase(),
    url: `${config.WBS_API_URL.replace(/\/+$/, '')}${path}${queryString === '' ? '' : `?${queryString}`}`,
    headers,
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
): Promise<ToolTextResult> {
  const request = buildRequest(tool, input, config, callerToken);
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: { ...request.headers },
    ...(request.body === undefined ? {} : { body: request.body }),
  });

  const bodyText = await response.text();
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
