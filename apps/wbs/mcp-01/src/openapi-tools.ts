import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Derives MCP inputs from generated shared descriptors, never a hand-listed tool table.
 * Explicit external documents remain supported for fixtures. Missing names, input
 * collisions and stale required exclusions throw rather than silently narrowing tools.
 */
export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Where a named input travels when the call is made. Section 3 reads this. */
export type InputLocation = 'path' | 'query' | 'body';

/** Plain JSON Schema, which is what the low-level MCP `Server` wants (D5). */
export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

export interface DerivedTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
  readonly method: HttpMethod;
  readonly path: string;
  readonly locations: Readonly<Record<string, InputLocation>>;
}

/**
 * The document as read off disk — every value optional, because it is parsed
 * JSON and this repo does not run `noUncheckedIndexedAccess`. Typing the holes
 * in is what lets the checks below be real checks rather than dead branches
 * lint would strip.
 */
interface OpenApiParameter {
  readonly name?: string;
  readonly in?: string;
  readonly required?: boolean;
  readonly schema?: unknown;
}

interface OpenApiBodySchema {
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly anyOf?: readonly unknown[];
  readonly allOf?: readonly unknown[];
  readonly oneOf?: readonly unknown[];
  readonly not?: unknown;
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
}

interface OpenApiOperation {
  readonly operationId?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: {
    readonly description?: string;
    readonly content?: Readonly<
      Record<string, { readonly schema?: OpenApiBodySchema } | undefined>
    >;
  };
}

type OpenApiPathItem = Readonly<Record<string, OpenApiOperation | undefined>>;

export interface OpenApiDocument {
  readonly 'x-wbs-human-only-operations'?: unknown;
  readonly paths?: Readonly<Record<string, OpenApiPathItem | undefined>>;
}

/**
 * D1's required exclusion classes, as one named set: the paths that are no tool by what they
 * are, not by who may use them. Administration is tagged `humanOnly` on its shape instead
 * ({@link humanOnlyOperationsOf}, `wbs-mcp-agent-surface` M8).
 *
 * `/api/auth/*` would make this a credential factory; `/internal/*` is gw-01's
 * surface behind a different secret; smoke carries no plan. Browser
 * organization selection creates a cookie tied to a browser access credential,
 * not an MCP delegation. A trailing
 * `/*` matches a prefix and nothing else does — no regex, because a pattern
 * that can match more than it reads is the wrong tool for a deny list.
 */

export const EXCLUDED_PATHS: readonly string[] = [
  '/api/auth/*',
  '/internal/*',
  '/api/smoke/echo',
  // Proof: removing this path exposed getApiOrganizationActive and failed
  // the generated current-context discovery exclusion; watched 2026-10-13.
  '/api/organization/active',
];

/** One operation a `humanOnly` shape declares, as the document names it. */
export interface HumanOnlyOperation {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
}

/**
 * Reads the required policy from the same artifact as its operations, without
 * loading schema validators. An explicit empty list is valid; absent or malformed
 * metadata refuses production derivation before any tool is exposed.
 * @throws when the policy is not an array of method/path/operationId records.
 */
export function humanOnlyOperationsOf(document: OpenApiDocument): HumanOnlyOperation[] {
  const declared = document['x-wbs-human-only-operations'];
  // Proof: treating missing metadata as [] made the otherwise-derivable subset
  // return protected tools instead of refusing in artifact-policy.test.ts (2026-10-28).
  if (!Array.isArray(declared)) throw new Error('missing human-only operation policy');
  return declared.map((supplied: unknown) => {
    // Proof: omitting this guard gave null a destructuring TypeError instead of the
    // modeled consumer-boundary refusal in artifact-policy.test.ts (2026-10-28).
    if (
      typeof supplied !== 'object' ||
      supplied === null ||
      Array.isArray(supplied) ||
      !('method' in supplied) ||
      !('path' in supplied) ||
      !('operationId' in supplied)
    )
      throw new Error('invalid human-only operation policy record');
    const { method, path, operationId } = supplied;
    // Proof: omitting field validation admitted an empty operationId through the
    // otherwise-valid subset consumer in artifact-policy.test.ts (2026-10-28).
    if (
      typeof method !== 'string' ||
      !isMethod(method) ||
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      typeof operationId !== 'string' ||
      operationId.trim() === ''
    )
      throw new Error('invalid human-only operation policy fields');
    return { method, path, operationId };
  });
}

/** What the MCP protocol accepts as a tool name; `operationId` must already fit. */
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Whether one exclusion entry covers this path: a path, or a `prefix/*`. Method
 * plays no part — every path in the document is all read or all excluded.
 */
const excludes = (pattern: string, path: string): boolean =>
  pattern.endsWith('/*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;

/** The exclusion entry covering this path, or none. */
// Operational endpoints live in the shared registry but never become model tools.
// They remain outside the required external exclusion set because they are optional
// in documents supplied by older or third-party servers.
// Proof: removing these deny paths exposed getHealth in the external-document production derivation test.
// Proof: removing the dependency-capability path exposed getDependencyCapability
// in the generated-document production derivation (12 pass / 2 fail, 2026-10-23).
const optionalOperationalPaths = [
  '/health',
  '/metrics',
  '/api/runtime/dependency-capability',
] as const;
const exclusionFor = (path: string): string | undefined =>
  [...EXCLUDED_PATHS, ...optionalOperationalPaths].find((candidate) => excludes(candidate, path));

/** Whether this path of the document becomes no tool. */
export const isExcluded = (path: string): boolean => exclusionFor(path) !== undefined;

function isMethod(key: string): key is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(key);
}

const joinProse = (...parts: (string | undefined)[]): string =>
  parts
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join('\n\n');

/**
 * One operation → one tool.
 *
 * @throws if the operation cannot become a tool without inventing something the
 * document does not say.
 */
function toTool(method: HttpMethod, path: string, operation: OpenApiOperation): DerivedTool {
  const where = `${method.toUpperCase()} ${path}`;
  const name = operation.operationId;

  // Synthesising a name from the path would work, right up until two paths
  // collapse to the same name and one tool silently shadowed the other.
  // Proof: bypassing this guard made the generated missing-operationId test return tools instead of throwing.
  if (name === undefined || name.trim() === '') {
    throw new Error(
      `${where} has no operationId, so no tool name can be derived. Give the route an operationId in be-01 and regenerate the shared OpenAPI document.`,
    );
  }
  if (!TOOL_NAME.test(name)) {
    throw new Error(
      `${where} has operationId "${name}", which is not a usable MCP tool name (letters, digits, "_" and "-", 1-128 characters).`,
    );
  }

  const properties = new Map<string, unknown>();
  const locations = new Map<string, InputLocation>();
  const required: string[] = [];

  const claim = (property: string, schema: unknown, location: InputLocation): void => {
    const taken = locations.get(property);
    if (taken !== undefined) {
      throw new Error(
        `${name}: "${property}" is declared as both a ${taken} input and a ${location} input. One would overwrite the other, so neither is sent.`,
      );
    }
    locations.set(property, location);
    properties.set(property, schema ?? {});
  };

  for (const parameter of operation.parameters ?? []) {
    const parameterName = parameter.name;
    if (parameterName === undefined || parameterName === '') {
      throw new Error(`${where} declares a parameter with no name.`);
    }
    // Header and cookie parameters would need mcp-01 to decide what to put in
    // them; it holds one token and no other credential, so it refuses instead.
    if (parameter.in !== 'path' && parameter.in !== 'query') {
      throw new Error(
        `${where} declares parameter "${parameterName}" in "${parameter.in ?? 'nowhere'}", which mcp-01 cannot send. Only path and query parameters become tool inputs.`,
      );
    }
    claim(parameterName, parameter.schema, parameter.in);
    // A path parameter is required whether or not the document says so: the URL
    // cannot be built without it.
    if (parameter.required === true || parameter.in === 'path') required.push(parameterName);
  }

  const body = operation.requestBody;
  if (body !== undefined) {
    const schema = body.content?.['application/json']?.schema;
    if (schema?.type !== 'object') {
      throw new Error(
        `${where} carries a request body with no application/json object schema, so its inputs cannot be derived.`,
      );
    }
    for (const [property, propertySchema] of Object.entries(schema.properties ?? {})) {
      claim(property, propertySchema, 'body');
    }
    for (const property of schema.required ?? []) {
      if (locations.get(property) !== 'body') {
        throw new Error(
          `${where} lists "${property}" as required in its body but does not declare it as a body property.`,
        );
      }
      required.push(property);
    }
  }

  // External documents may omit prose; do not invent API instructions in MCP.
  const written = joinProse(operation.summary, operation.description);
  const headline =
    written === ''
      ? `${where} — the OpenAPI document carries no prose for this operation.`
      : written;

  return {
    name,
    // Preserve any external request-body prose without paraphrasing its contract.
    description: joinProse(
      headline,
      body?.description === undefined ? undefined : `Request body: ${body.description}`,
    ),
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(properties),
      ...(required.length > 0 ? { required: [...new Set(required)] } : {}),
      // mcp-01 refuses to forward an input the operation does not declare (task
      // 3.1), so the schema says the same thing rather than advertising a
      // permissiveness the caller would then hit a throw on.
      additionalProperties: false,
    },
    method,
    path,
    locations: Object.fromEntries(locations),
  };
}

/**
 * Every operation in the document that is not excluded, as a tool.
 *
 * @throws if an entry in {@link EXCLUDED_PATHS}, or an operation in `humanOnly`
 * (by default every `humanOnly` shape, M8), matches nothing in the document. An exclusion that has stopped matching is a route that has moved,
 * and the failure it hides — the list excluding less than it reads, a renamed
 * `/internal/*` reappearing as a callable tool — is silent everywhere else.
 */
export function toolsFromDocument(
  document: OpenApiDocument,
  humanOnly: readonly HumanOnlyOperation[] = humanOnlyOperationsOf(document),
): DerivedTool[] {
  const paths = document.paths;
  if (paths === undefined || Object.keys(paths).length === 0) {
    throw new Error('the OpenAPI document has no paths, so no tools can be derived from it.');
  }

  const matched = new Set<string>();
  const humanOnlyMatched = new Set<HumanOnlyOperation>();
  const tools: DerivedTool[] = [];
  const seen = new Map<string, string>();

  for (const [path, item] of Object.entries(paths)) {
    if (item === undefined) continue;
    for (const [key, operation] of Object.entries(item)) {
      if (!isMethod(key) || operation === undefined) continue;
      const pattern = exclusionFor(path);
      if (pattern !== undefined) {
        matched.add(pattern);
        continue;
      }
      // Proof: with this skip removed, `emits no tool for any of D1’s three exclusion classes`
      // (openapi-tools.test.ts) found getApiOrganizationMemberships as a tool, and deriving the
      // generated document threw at POST /api/organization/machine-credentials, whose body is
      // no JSON object; watched 2026-10-28.
      const administration = humanOnly.find(
        (operation) => operation.method === key && operation.path === path,
      );
      if (administration !== undefined) {
        humanOnlyMatched.add(administration);
        continue;
      }
      const tool = toTool(key, path, operation);
      const first = seen.get(tool.name);
      if (first !== undefined) {
        throw new Error(
          `operationId "${tool.name}" is used by both ${first} and ${key.toUpperCase()} ${path}; one tool would shadow the other.`,
        );
      }
      seen.set(tool.name, `${key.toUpperCase()} ${path}`);
      tools.push(tool);
    }
  }

  const stale = EXCLUDED_PATHS.filter((pattern) => !matched.has(pattern));
  // Proof: bypassing this guard made required exclusion drift return tools instead of throwing.
  if (stale.length > 0) {
    throw new Error(
      `the exclusion list names ${stale.map((pattern) => `"${pattern}"`).join(', ')}, which the document no longer contains. A route that moved must be re-excluded under its new path, or dropped from the list deliberately — see design.md D1.`,
    );
  }

  const unmatched = humanOnly.filter((operation) => !humanOnlyMatched.has(operation));
  // A tag that matches nothing protects nothing: the route it meant may be served under
  // another path or method, as a tool.
  // Proof: with this guard removed, `refuses to start when a humanOnly shape matches no
  // operation` (openapi-tools.test.ts) returned tools instead of throwing; watched 2026-10-28.
  if (unmatched.length > 0) {
    throw new Error(
      `the humanOnly shapes ${unmatched.map((operation) => `${operation.method.toUpperCase()} ${operation.path} (${operation.operationId})`).join(', ')} match no operation of the document, so mcp-01 cannot show they are no tool (wbs-mcp-agent-surface M8).`,
    );
  }

  return tools;
}

/**
 * Reads the required same-checkout build artifact beside this runtime module.
 * Explicit paths support external fixtures. Missing, unreadable and malformed
 * documents refuse startup; runtime never imports the HTTP schema validators.
 */
// Proof: the bundled default-runtime tests failed when artifact reads were
// replaced by runtime generation: missing/unreadable/malformed files booted.
export function readDocument(
  file = fileURLToPath(new URL('./openapi.json', import.meta.url)),
): OpenApiDocument {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (cause) {
    throw new Error(`cannot read the OpenAPI document at ${file}`, { cause });
  }
  try {
    // The document is generated by emit-openapi-cli; toolsFromDocument checks
    // the operation and exclusion invariants before any tool is exposed.
    return JSON.parse(text) as OpenApiDocument;
  } catch (cause) {
    throw new Error(`the OpenAPI document at ${file} is not valid JSON`, { cause });
  }
}
